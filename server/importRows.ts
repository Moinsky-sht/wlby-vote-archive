import path from 'node:path';
import iconv from 'iconv-lite';
import * as XLSX from 'xlsx';
import type { ImportRow } from './store.js';

interface ImportFileLike {
  originalname: string;
  mimetype?: string;
  buffer: Buffer;
}

function cellText(cell: XLSX.CellObject | undefined) {
  if (!cell) return '';
  if (cell.w) return String(cell.w).trim();
  if (cell.v === null || cell.v === undefined) return '';
  if (cell.v instanceof Date) return cell.v.toISOString().slice(0, 10);
  return String(cell.v).trim();
}

function cellValue(cell: XLSX.CellObject | undefined) {
  const text = cellText(cell);
  const target = cell?.l?.Target;
  if (target) return { text, url: target };
  return text;
}

function uniqueHeader(name: string, used: Map<string, number>) {
  const clean = name.trim();
  if (!clean) return '';
  const count = used.get(clean) || 0;
  used.set(clean, count + 1);
  return count ? `${clean}_${count + 1}` : clean;
}

function parseWorksheet(sheet: XLSX.WorkSheet): ImportRow[] {
  if (!sheet['!ref']) return [];
  const range = XLSX.utils.decode_range(sheet['!ref']);
  let headerRow = range.s.r;

  for (let row = range.s.r; row <= range.e.r; row += 1) {
    const hasValue = Array.from({ length: range.e.c - range.s.c + 1 }, (_, index) => {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: range.s.c + index })];
      return Boolean(cellText(cell));
    }).some(Boolean);
    if (hasValue) {
      headerRow = row;
      break;
    }
  }

  const used = new Map<string, number>();
  const headers = Array.from({ length: range.e.c - range.s.c + 1 }, (_, index) => {
    const cell = sheet[XLSX.utils.encode_cell({ r: headerRow, c: range.s.c + index })];
    return uniqueHeader(cellText(cell), used);
  });

  const rows: ImportRow[] = [];
  for (let row = headerRow + 1; row <= range.e.r; row += 1) {
    const record: ImportRow = {};
    let hasValue = false;

    headers.forEach((header, index) => {
      if (!header) return;
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: range.s.c + index })];
      const value = cellValue(cell);
      const text = typeof value === 'string' ? value : value.text || value.url || '';
      if (text) hasValue = true;
      record[header] = value;
    });

    if (hasValue) rows.push(record);
  }

  return rows;
}

function normalizeJsonRows(value: unknown): ImportRow[] {
  if (Array.isArray(value)) return value as ImportRow[];
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    if (Array.isArray(object.works)) return object.works as ImportRow[];
    if (Array.isArray(object.records)) return object.records as ImportRow[];
    if (object.data && typeof object.data === 'object') {
      const data = object.data as Record<string, unknown>;
      if (Array.isArray(data.data)) return data.data as ImportRow[];
      if (Array.isArray(data.records)) return data.records as ImportRow[];
    }
  }
  throw new Error('JSON 文件必须是数组，或包含 works/records/data.data 数组');
}

export function parseImportRowsFromFile(file: ImportFileLike): ImportRow[] {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.json' || file.mimetype === 'application/json') {
    return normalizeJsonRows(JSON.parse(file.buffer.toString('utf8')));
  }

  if (ext === '.csv' || /csv/.test(file.mimetype || '')) {
    const utf8 = new TextDecoder('utf-8', { fatal: true });
    let text: string;
    try {
      text = utf8.decode(file.buffer);
    } catch {
      text = iconv.decode(file.buffer, 'gb18030');
    }
    text = text.replace(/^\uFEFF/, '');
    const workbook = XLSX.read(text, { type: 'string', cellDates: true, cellHTML: false, raw: false });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error('CSV 文件中没有可读取的数据');
    return parseWorksheet(workbook.Sheets[sheetName]);
  }

  if (['.xlsx', '.xls'].includes(ext) || /spreadsheet|excel/.test(file.mimetype || '')) {
    const workbook = XLSX.read(file.buffer, { type: 'buffer', cellDates: true, cellHTML: false });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error('文件中没有可读取的工作表');
    return parseWorksheet(workbook.Sheets[sheetName]);
  }

  throw new Error('仅支持 .xlsx、.xls、.csv、.json 文件');
}
