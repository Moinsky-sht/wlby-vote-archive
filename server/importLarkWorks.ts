import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { ImportRow } from './store.js';

interface Args {
  baseToken?: string;
  tableId?: string;
  viewId?: string;
  jsonFile?: string;
  dryRun: boolean;
  limit: number;
}

function readArg(name: string, argv: string[]) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  return {
    baseToken: readArg('--base-token', argv) || process.env.LARK_BASE_TOKEN,
    tableId: readArg('--table-id', argv) || process.env.LARK_TABLE_ID,
    viewId: readArg('--view-id', argv) || process.env.LARK_VIEW_ID,
    jsonFile: readArg('--json-file', argv),
    dryRun: argv.includes('--dry-run'),
    limit: Number(readArg('--limit', argv) || 200)
  };
}

function rowsFromEnvelope(payload: unknown): ImportRow[] {
  const root = payload as Record<string, unknown>;
  const data = (root.data || root) as Record<string, unknown>;
  const rows = (Array.isArray(data.data) && data.data) || (Array.isArray(data.records) && data.records) || (Array.isArray(root.records) && root.records) || [];
  const fieldNames = Array.isArray(data.fields) ? data.fields.map(String) : [];
  const recordIds = Array.isArray(data.record_id_list) ? data.record_id_list.map(String) : [];

  return rows.map((row, index) => {
    if (Array.isArray(row) && fieldNames.length) {
      const fields = Object.fromEntries(fieldNames.map((name, fieldIndex) => [name, row[fieldIndex]]));
      return { recordId: recordIds[index], fields } as ImportRow;
    }
    const record = row as Record<string, unknown>;
    if (record.fields && typeof record.fields === 'object') {
      return {
        recordId: record.record_id || record.id,
        fields: record.fields
      } as ImportRow;
    }
    return record as ImportRow;
  }).filter((row) => {
    const fields = row.fields && typeof row.fields === 'object' ? row.fields as Record<string, unknown> : row;
    return Object.values(fields).some((value) => value !== null && value !== undefined && value !== '');
  });
}

function listRecords(args: Args, offset: number) {
  if (!args.baseToken || !args.tableId) {
    throw new Error('缺少 --base-token 或 --table-id，也可以用 LARK_BASE_TOKEN / LARK_TABLE_ID 环境变量');
  }

  const command = [
    'base',
    '+record-list',
    '--as',
    process.env.LARK_RECORD_IDENTITY || 'user',
    '--json',
    '--base-token',
    args.baseToken,
    '--table-id',
    args.tableId,
    '--limit',
    String(args.limit),
    '--offset',
    String(offset)
  ];
  if (args.viewId) command.push('--view-id', args.viewId);

  const result = spawnSync('lark-cli', command, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'lark-cli record-list failed');
  }

  return JSON.parse(result.stdout) as Record<string, unknown>;
}

function fetchLarkRows(args: Args) {
  if (args.jsonFile) {
    return rowsFromEnvelope(JSON.parse(fs.readFileSync(args.jsonFile, 'utf8')));
  }

  const rows: ImportRow[] = [];
  let offset = 0;
  for (;;) {
    const envelope = listRecords(args, offset);
    rows.push(...rowsFromEnvelope(envelope));
    const data = (envelope.data || {}) as Record<string, unknown>;
    if (!data.has_more) break;
    offset += args.limit;
  }
  return rows;
}

const args = parseArgs();
const rows = fetchLarkRows(args);
if (args.dryRun) {
  console.log(JSON.stringify({ ok: true, dryRun: true, rows: rows.length, sample: rows.slice(0, 3) }, null, 2));
  process.exit(0);
}

if (!rows.length) {
  console.log(JSON.stringify({ ok: true, count: 0, message: '飞书表格暂无可导入记录' }, null, 2));
  process.exit(0);
}

const uploadsDir = path.resolve(process.env.UPLOADS_DIR || path.join(process.env.DATA_DIR || path.join(process.cwd(), 'data'), 'uploads'));
const { localizeImportAttachments, rollbackLocalizedFiles } = await import('./importAttachments.js');
const { ensureDb, importAdminWorks } = await import('./store.js');
await ensureDb();
const localized = await localizeImportAttachments(rows, uploadsDir);
try {
  const result = await importAdminWorks(localized.rows);
  console.log(JSON.stringify({ ok: true, rows: rows.length, imported: result.count, localizedFiles: localized.createdPaths.length }, null, 2));
} catch (error) {
  await rollbackLocalizedFiles(localized.createdPaths);
  throw error;
}
