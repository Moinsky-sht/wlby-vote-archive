import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { saveProcessedFile, type UploadPurpose } from './imageProcessor.js';
import type { ImportRow } from './store.js';

const coverFields = new Set([
  'cover',
  '作品首张海报（A3竖版）',
  '作品首张海报',
  'A3竖版海报',
  '封面图横版 4:3',
  '封面图',
  '作品封面图',
  'fldhiJATnV'
]);
const mediaFields = new Set([
  'media',
  '作品附件',
  '附件',
  '作品文件',
  'fldVI5nS5B',
  '其他附件/授权材料',
  '授权材料',
  '其他附件',
  'fldpMSNB0i'
]);
const localUrlPrefixes = ['/assets/', '/uploads/'];
const maxRemoteAttachmentBytes = 100 * 1024 * 1024;
const maxLarkAttachmentBytes = 600 * 1024 * 1024;
const larkDownloadMaxAttempts = 3;
const larkDownloadRetryDelayMs = 2000;
const videoExtensions = new Set(['.mp4', '.mov', '.webm']);

function isVideoName(name: string) {
  return videoExtensions.has(path.extname(name).toLowerCase());
}

interface AttachmentObject extends Record<string, unknown> {
  file_token?: unknown;
  fileToken?: unknown;
  token?: unknown;
  name?: unknown;
  title?: unknown;
  file_name?: unknown;
  url?: unknown;
  tmp_url?: unknown;
  download_url?: unknown;
  file_url?: unknown;
  link?: unknown;
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function attachmentName(value: AttachmentObject, fallback: string) {
  return text(value.name) || text(value.title) || text(value.file_name) || fallback;
}

function attachmentToken(value: AttachmentObject) {
  return text(value.file_token) || text(value.fileToken) || text(value.token);
}

function attachmentUrl(value: AttachmentObject) {
  return text(value.url) || text(value.tmp_url) || text(value.download_url) || text(value.file_url) || text(value.link);
}

function allowedAttachmentHosts() {
  return (process.env.LARK_ATTACHMENT_ALLOWED_HOSTS || '.feishu.cn,.larksuite.com,.feishucdn.com,.larksuitecdn.com')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function assertAllowedUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:') throw new Error('附件地址必须使用 HTTPS');
  const hostname = url.hostname.toLowerCase();
  if (!allowedAttachmentHosts().some((allowed) => hostname === allowed.replace(/^\./, '') || hostname.endsWith(allowed))) {
    throw new Error(`附件地址不在允许的飞书域名范围内：${hostname}`);
  }
  return url;
}

async function readRemoteAttachment(rawUrl: string) {
  assertAllowedUrl(rawUrl);
  const response = await fetch(rawUrl, { redirect: 'follow', signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`附件下载失败（HTTP ${response.status}）`);
  assertAllowedUrl(response.url);
  const declaredSize = Number(response.headers.get('content-length') || 0);
  if (declaredSize > maxRemoteAttachmentBytes) throw new Error('远程附件超过100MB限制');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > maxRemoteAttachmentBytes) throw new Error('远程附件超过100MB限制');
  return { buffer, mimeType: response.headers.get('content-type')?.split(';')[0] };
}

function larkCacheDir() {
  const base = process.env.DATA_DIR || path.join(process.cwd(), 'data');
  return path.join(base, 'lark-attachment-cache');
}

function larkCachePath(fileToken: string) {
  return path.join(larkCacheDir(), `${fileToken}.bin`);
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function runLarkDownload(command: string[], cwd: string, outputPath: string) {
  const result = spawnSync('lark-cli', command, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    env: {
      ...process.env,
      LARKSUITE_CLI_NO_UPDATE_NOTIFIER: '1',
      LARKSUITE_CLI_NO_SKILLS_NOTIFIER: '1'
    }
  });
  const succeeded = result.status === 0 && fs.existsSync(outputPath);
  return { result, succeeded };
}

function downloadCommand(identity: string, fileToken: string, outputName: string) {
  return [
    'drive',
    '+download',
    '--as',
    identity,
    '--file-token',
    fileToken,
    '--output',
    `./${outputName}`,
    '--overwrite',
    '--format',
    'json'
  ];
}

function previewCommand(identity: string, fileToken: string, outputName: string) {
  return [
    'drive',
    '+preview',
    '--as',
    identity,
    '--file-token',
    fileToken,
    '--type',
    'source_file',
    '--output',
    `./${outputName}`,
    '--if-exists',
    'overwrite',
    '--format',
    'json'
  ];
}

function previewVideoCommand(identity: string, fileToken: string, outputName: string) {
  return [
    'drive',
    '+preview',
    '--as',
    identity,
    '--file-token',
    fileToken,
    '--type',
    'mp4_1080p',
    '--output',
    `./${outputName}`,
    '--if-exists',
    'overwrite',
    '--format',
    'json'
  ];
}

async function downloadLarkWithRetry(fileToken: string, originalName: string, video: boolean): Promise<Buffer> {
  const identity = process.env.LARK_ATTACHMENT_IDENTITY || 'user';
  const outputName = path.basename(originalName) || 'attachment.bin';
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'h5-lark-'));
  const tempPath = path.join(tempDir, outputName);
  try {
    // 视频附件优先用飞书已转码的 1080P MP4 预览版（稳定、体积小、免本地转码），
    // 失败再回退到原始文件（source_file）和直连下载。
    const commands = video
      ? [previewVideoCommand(identity, fileToken, outputName), previewCommand(identity, fileToken, outputName), downloadCommand(identity, fileToken, outputName)]
      : [downloadCommand(identity, fileToken, outputName), previewCommand(identity, fileToken, outputName)];
    let lastError = '未知错误';
    let succeeded = false;
    for (const command of commands) {
      for (let attempt = 1; attempt <= larkDownloadMaxAttempts; attempt += 1) {
        if (fs.existsSync(tempPath)) await fs.promises.rm(tempPath, { force: true });
        const outcome = runLarkDownload(command, tempDir, tempPath);
        if (outcome.succeeded) {
          succeeded = true;
          break;
        }
        lastError = (outcome.result.stderr || outcome.result.stdout || '未知错误').trim();
        if (attempt < larkDownloadMaxAttempts) {
          await sleep(larkDownloadRetryDelayMs * attempt);
        }
      }
      if (succeeded) break;
    }
    if (!succeeded) {
      throw new Error(`飞书附件下载失败（已重试${larkDownloadMaxAttempts}次）：${lastError}`);
    }
    if (!fs.existsSync(tempPath)) throw new Error('飞书附件下载失败：未生成文件');
    const stat = await fs.promises.stat(tempPath);
    if (stat.size > maxLarkAttachmentBytes) throw new Error('飞书附件超过600MB限制');
    if (stat.size === 0) throw new Error('飞书附件下载失败：文件为空');
    return await fs.promises.readFile(tempPath);
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
}

async function readLarkAttachment(fileToken: string, originalName: string) {
  await fs.promises.mkdir(larkCacheDir(), { recursive: true });
  const video = isVideoName(originalName);
  const cacheSuffix = video ? '.mp4' : '';
  const cachePath = larkCachePath(fileToken) + cacheSuffix;
  let buffer: Buffer | undefined;
  try {
    const cached = await fs.promises.stat(cachePath);
    if (cached.size > 0 && cached.size <= maxLarkAttachmentBytes) {
      buffer = await fs.promises.readFile(cachePath);
    }
  } catch {
    // 缓存不存在，继续下载。
  }
  if (!buffer) {
    buffer = await downloadLarkWithRetry(fileToken, originalName, video);
    await fs.promises.writeFile(cachePath, buffer);
  }
  return {
    buffer,
    mimeType: video ? 'video/mp4' : undefined,
    // 视频附件经 mp4_1080p 预览下载后实际是 MP4，统一把名字改为 .mp4 供后续处理。
    originalName: video ? `${path.basename(originalName, path.extname(originalName))}.mp4` : originalName,
    larkVideoPreview: video
  };
}

async function downloadAndProcess(input: {
  token?: string;
  url?: string;
  name: string;
  purpose: UploadPurpose;
  uploadsDir: string;
}) {
  const downloaded = input.token
    ? await readLarkAttachment(input.token, input.name)
    : input.url
      ? await readRemoteAttachment(input.url)
      : undefined;
  if (!downloaded) throw new Error(`附件“${input.name}”缺少可下载的 file_token 或 URL`);
  const larkVideoPreview = (downloaded as { larkVideoPreview?: boolean }).larkVideoPreview === true;
  const resolvedName = (downloaded as { originalName?: string }).originalName || input.name;
  return saveProcessedFile({
    buffer: downloaded.buffer,
    mimeType: downloaded.mimeType,
    originalName: resolvedName,
    purpose: input.purpose,
    uploadsDir: input.uploadsDir,
    videoAlreadyMp4: larkVideoPreview
  });
}

async function localizeValue(
  value: unknown,
  purpose: UploadPurpose,
  uploadsDir: string,
  createdPaths: string[],
  fallbackName: string
): Promise<unknown> {
  if (value === null || value === undefined || value === '') return value;
  if (Array.isArray(value)) {
    return Promise.all(value.map((item, index) => localizeValue(item, purpose, uploadsDir, createdPaths, `${fallbackName}_${index + 1}`)));
  }
  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw || localUrlPrefixes.some((prefix) => raw.startsWith(prefix))) return value;
    if (/^[\[{]/.test(raw)) {
      try {
        return JSON.stringify(await localizeValue(JSON.parse(raw), purpose, uploadsDir, createdPaths, fallbackName));
      } catch (error) {
        if (error instanceof SyntaxError) return value;
        throw error;
      }
    }
    if (!/^https:\/\//i.test(raw)) {
      throw new Error(`附件“${raw}”只有文件名，没有可下载地址；请使用保留附件链接的 Excel 或 Lark CLI 导入`);
    }
    const saved = await downloadAndProcess({ url: raw, name: fallbackName, purpose, uploadsDir });
    createdPaths.push(saved.path);
    return saved.url;
  }
  if (typeof value !== 'object') return value;

  const object = value as AttachmentObject;
  const currentUrl = attachmentUrl(object);
  if (currentUrl && localUrlPrefixes.some((prefix) => currentUrl.startsWith(prefix))) return value;
  const token = attachmentToken(object);
  if (!token && !currentUrl) {
    const name = attachmentName(object, '未命名附件');
    if (name !== '未命名附件') {
      throw new Error(`附件“${name}”缺少可下载的 file_token 或 URL`);
    }
    return value;
  }
  const name = attachmentName(object, fallbackName);
  const saved = await downloadAndProcess({ token, url: currentUrl, name, purpose, uploadsDir });
  createdPaths.push(saved.path);
  return { ...object, url: saved.url, download_url: saved.url };
}

export async function localizeImportAttachments(rows: ImportRow[], uploadsDir: string) {
  const createdPaths: string[] = [];
  try {
    const localizedRows: ImportRow[] = [];
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const target = row.fields && typeof row.fields === 'object' && !Array.isArray(row.fields)
        ? { ...row, fields: { ...(row.fields as Record<string, unknown>) } }
        : { ...row };
      const fields = (target.fields && typeof target.fields === 'object' ? target.fields : target) as Record<string, unknown>;
      for (const key of Object.keys(fields)) {
        const purpose = coverFields.has(key) ? 'cover' : mediaFields.has(key) ? 'media' : undefined;
        if (!purpose) continue;
        try {
          fields[key] = await localizeValue(fields[key], purpose, uploadsDir, createdPaths, `第${index + 2}行_${key}`);
        } catch (error) {
          throw new Error(`第${index + 2}行“${key}”：${error instanceof Error ? error.message : '附件处理失败'}`);
        }
      }
      localizedRows.push(target);
    }
    return { rows: localizedRows, createdPaths };
  } catch (error) {
    await rollbackLocalizedFiles(createdPaths);
    throw error;
  }
}

export async function rollbackLocalizedFiles(paths: string[]) {
  await Promise.all(paths.map((filePath) => fs.promises.rm(filePath, { force: true }).catch(() => undefined)));
}
