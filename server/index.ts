import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { prisma } from './prisma.js';
import { workShareHtml, siteShareHtml } from './sharePage.js';
import * as XLSX from 'xlsx';
import { currentAdmin, loginAdmin, logoutAdmin } from './adminAuth.js';
import { sessionCookieOptions, warnForInsecureProductionCookies } from './cookieOptions.js';
import { HttpError } from './httpError.js';
import { normalizeIp } from './antiAbuse.js';
import { resetAllVotes } from './voteReset.js';
import { sendEmailCode } from './mailer.js';
import { registrationSmsConfigured, sendRegistrationSmsCode } from './sms.js';
import { saveProcessedFile, type UploadPurpose } from './imageProcessor.js';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { localizeImportAttachments, rollbackLocalizedFiles } from './importAttachments.js';
import { parseImportRowsFromFile } from './importRows.js';
import {
  beijingDay,
  batchUpdateWorks,
  castVote,
  createReport,
  dailyVisitStats,
  ensureDb,
  getPhase,
  importAdminWorks,
  normalizeWork,
  persistWork,
  publicWorks,
  rankingFor,
  readDb,
  recordVisit,
  saveAdminConfig,
  setReportStatus,
  setWorkStatus,
  stats,
  todayVotes,
  uvCount,
  voteUsers,
  type ReportStatus,
  type ThemeId,
  type UserSession,
  type Work
} from './store.js';
import {
  findAuthSessionByToken,
  getUserProfile,
  getUserVotes,
  listAdminUsers,
  logoutUser,
  requestAuthCode,
  verifyAuthCode,
  loginRegisteredUser,
  setUserStatus,
  type AuthSession
} from './userAuth.js';

const app = express();
app.set('trust proxy', Number(process.env.TRUST_PROXY || 1));
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '0.0.0.0';
const secret = process.env.APP_SECRET || 'bj-youth-vote-local-secret';
const dataDir = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
const uploadsDir = path.resolve(process.env.UPLOADS_DIR || path.join(dataDir, 'uploads'));
const assetsDir = path.resolve(process.env.ASSETS_DIR || path.join(process.cwd(), 'outputs/generated-component-backgrounds'));
const clientDir = path.resolve(process.env.CLIENT_DIR || path.join(process.cwd(), 'dist/client'));
const staticAssetCdnBaseUrl = String(process.env.STATIC_ASSET_CDN_BASE_URL || '').replace(/\/+$/g, '');
const staticAssetCdnSignKey = String(process.env.STATIC_ASSET_CDN_SIGN_KEY || '').trim();
const staticAssetObjectPrefix = String(process.env.STATIC_ASSET_OBJECT_PREFIX || '').replace(/^\/+|\/+$/g, '');
const userSessionCookie = 'bj_vote_user_session';

await ensureDb();
warnForInsecureProductionCookies();
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

app.use(cors());
app.use(express.json({ limit: '20mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024
  }
});

const staticImageOptions = {
  maxAge: '30d',
  immutable: true,
  setHeaders(res: Response) {
    res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
  }
};

function serveImageDirectory(route: string, directory: string) {
  app.use(route, express.static(directory, staticImageOptions));
}

// Vite emits the application bundle under dist/client/assets. Serve those
// files locally before the source-image CDN redirect below so hashed JS/CSS
// are never mistaken for offloaded design assets.
app.use('/assets', express.static(path.join(clientDir, 'assets'), staticImageOptions));

function uploadPurpose(value: unknown): UploadPurpose {
  return value === 'cover' ? 'cover' : 'media';
}

async function saveUploadedFile(file: Express.Multer.File, purpose: UploadPurpose = 'media') {
  return saveProcessedFile({
    buffer: file.buffer,
    originalName: file.originalname,
    mimeType: file.mimetype,
    purpose,
    uploadsDir
  });
}

if (staticAssetCdnBaseUrl && staticAssetCdnSignKey && staticAssetObjectPrefix) {
  app.get('/assets/:filename', async (req, res, next) => {
    const filename = String(req.params.filename || '');
    if (!/^[A-Za-z0-9_.-]+$/.test(filename)) {
      next();
      return;
    }
    const resourcePath = `/${staticAssetObjectPrefix}/${filename}`;
    const encodedPath = resourcePath.split('/').map((segment) => encodeURIComponent(segment)).join('/');
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto.createHash('md5')
      .update(`${staticAssetCdnSignKey}${encodedPath}${timestamp}`)
      .digest('hex');
    const assetUrl = `${staticAssetCdnBaseUrl}${encodedPath}?sign=${signature}&t=${timestamp}`;
    // Large originals and lossless variants must bypass the application server's
    // bandwidth. Keep small previews same-origin for share-poster canvas safety.
    // COS applies the download header at the final response, not the redirect.
    if (/\.(mp4|webm|mov)$/i.test(filename) || /-(original|lossless)-[a-f0-9]{16}\./.test(filename) || req.query.download === '1' || req.query.direct === '1') {
      const target = req.query.download === '1'
        ? `${assetUrl}&response-content-disposition=${encodeURIComponent(`attachment; filename="${filename}"`)}`
        : assetUrl;
      // Cache view redirects briefly so reopening a large image reuses the
      // browser's already-downloaded signed URL. CDN signatures remain valid
      // for at least 30 minutes; this local cache is limited to five minutes.
      res.setHeader('Cache-Control', req.query.download === '1' ? 'no-store' : 'private, max-age=300');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.redirect(302, target);
      return;
    }
    try {
      const controller = new AbortController();
      res.once('close', () => controller.abort());
      const upstream = await fetch(assetUrl, {method:req.method==='HEAD'?'HEAD':'GET',signal:controller.signal});
      if (!upstream.ok) {
        throw new Error(`asset upstream returned ${upstream.status}`);
      }
      const contentType = upstream.headers.get('content-type');
      if (contentType) res.setHeader('Content-Type', contentType);
      const contentLength = upstream.headers.get('content-length');
      if (contentLength) res.setHeader('Content-Length', contentLength);
      if (req.query.download === '1') res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
      // Original artwork can be tens of megabytes. Stream without buffering the
      // entire image in application memory or writing it to the server disk.
      if(req.method==='HEAD' || !upstream.body) {res.end();return;}
      await pipeline(Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]),res);
    } catch (error) {
      next(error);
    }
  });
} else {
  serveImageDirectory('/assets', assetsDir);
}
serveImageDirectory('/uploads', uploadsDir);

function parseCookies(header?: string) {
  const cookies = new Map<string, string>();
  for (const part of (header || '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (!key) continue;
    try {
      cookies.set(key, decodeURIComponent(value.join('=')));
    } catch {
      cookies.set(key, value.join('='));
    }
  }
  return cookies;
}

function setUserSessionCookie(res: Response, session: UserSession | AuthSession) {
  const maxAgeSeconds = Math.max(0, Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000));
  res.setHeader('Set-Cookie', `${userSessionCookie}=${encodeURIComponent(session.token)}; ${sessionCookieOptions(maxAgeSeconds)}`);
}

function clearUserSessionCookie(res: Response) {
  res.setHeader('Set-Cookie', `${userSessionCookie}=; ${sessionCookieOptions(0)}`);
}

function tokenFrom(req: Request) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return parseCookies(req.headers.cookie).get(userSessionCookie);
}

function publicSessionPayload(session: UserSession | AuthSession) {
  return {
    phone: session.phone,
    email: 'email' in session ? session.email : undefined,
    expiresAt: session.expiresAt
  };
}

async function userSessionFrom(req: Request) {
  return findAuthSessionByToken(tokenFrom(req));
}

function clientIp(req: Request) {
  return normalizeIp(req.ip || req.socket.remoteAddress || '');
}

async function phoneFrom(req: Request) {
  return (await userSessionFrom(req))?.phone;
}

function sendApiError(res: Response, statusCode: number, message: string, code: string, details?: Record<string, unknown>) {
  res.status(statusCode).json({ message, code, ...details });
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  currentAdmin(req)
    .then((admin) => {
      if (!admin) {
        sendApiError(res, 401, '请先登录后台', 'ADMIN_AUTH_REQUIRED');
        return;
      }
      res.locals.admin = admin;
      next();
    })
    .catch(next);
}

function asyncRoute(fn: (req: Request, res: Response) => Promise<void> | void) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req, res);
    } catch (error) {
      next(error);
    }
  };
}

app.get('/api/config', asyncRoute(async (_req, res) => {
  const db = await readDb();
  res.json({
    config: db.config,
    stats: stats(db),
    serverTime: new Date().toISOString(),
    phase: getPhase(db.config)
  });
}));

app.get('/api/works', asyncRoute(async (req, res) => {
  const db = await readDb();
  const search = String(req.query.search || '').trim().toLowerCase();
  const works = publicWorks(db)
    .filter((work) => {
      if (!search) return true;
      return `${work.code} ${work.title} ${work.author} ${work.team || ''}`.toLowerCase().includes(search);
    })
    .sort((a, b) => a.displayOrder - b.displayOrder);
  res.json({ works, total: works.length });
}));

app.get('/api/works/:id', asyncRoute(async (req, res) => {
  const db = await readDb();
  const work = db.works.find((item) => item.id === req.params.id);
  if (!work) {
    sendApiError(res, 404, '作品不存在', 'WORK_NOT_FOUND');
    return;
  }
  if (work.status !== 'published') {
    sendApiError(res, 410, '该作品已下架', 'WORK_OFFLINE');
    return;
  }
  res.json({ work });
}));

app.get('/api/auth/options', (_req, res) => res.json({
  email: false,
  phone: registrationSmsConfigured()
}));

for (const purpose of ['register', 'login'] as const) {
  for (const channel of ['phone', 'email'] as const) {
    const route = channel === 'phone' ? '/api/auth/' + purpose : '/api/auth/email/' + purpose;
    const sendRoute = channel === 'phone' ? route + '/sms/send' : route + '/send';
    if (purpose === 'register') app.post(sendRoute, asyncRoute(async (req, res) => {
      if (channel === 'phone' && !registrationSmsConfigured()) throw new Error('短信注册暂不可用，请稍后重试');
      const input = String(req.body[channel] || '');
      await requestAuthCode(channel, input, purpose, clientIp(req), async (identifier, code) => {
        if (channel === 'email') await sendEmailCode(identifier, code, purpose);
        else await sendRegistrationSmsCode(identifier, code);
      });
      res.json({ message: channel === 'email' ? '验证码已发送，请检查邮箱及垃圾邮件' : '验证码已发送' });
    }));
    app.post(route, asyncRoute(async (req, res) => {
      const session = purpose === 'login'
        ? await loginRegisteredUser(channel, String(req.body[channel] || ''), clientIp(req), String(req.headers['x-visitor-id'] || ''))
        : await verifyAuthCode(channel, String(req.body[channel] || ''), String(req.body.code || ''), purpose, clientIp(req), String(req.headers['x-visitor-id'] || ''));
      setUserSessionCookie(res, session);
      res.json(publicSessionPayload(session));
    }));
  }
}

app.post('/api/auth/logout', asyncRoute(async (req, res) => {
  await logoutUser(tokenFrom(req));
  clearUserSessionCookie(res);
  res.json({ ok: true });
}));

app.get('/api/auth/session', asyncRoute(async (req, res) => {
  const session = await userSessionFrom(req);
  if (!session) {
    clearUserSessionCookie(res);
    sendApiError(res, 401, '登录状态已失效，请重新登录', 'SESSION_EXPIRED');
    return;
  }
  setUserSessionCookie(res, session);
  res.json(publicSessionPayload(session));
}));

app.get('/api/me', asyncRoute(async (req, res) => {
  const session = await userSessionFrom(req);
  if (!session) {
    sendApiError(res, 401, '请先登录', 'AUTH_REQUIRED');
    return;
  }
  res.json({ profile: await getUserProfile(session.userId, clientIp(req)) });
}));

app.get('/api/me/votes', asyncRoute(async (req, res) => {
  const session = await userSessionFrom(req);
  if (!session) {
    sendApiError(res, 401, '请先登录', 'AUTH_REQUIRED');
    return;
  }
  res.json({ records: await getUserVotes(session.userId) });
}));

app.post('/api/votes', asyncRoute(async (req, res) => {
  const session = await userSessionFrom(req);
  if (!session) {
    sendApiError(res, 401, '请先登录后投票', 'AUTH_REQUIRED');
    return;
  }
  const result = await castVote(session.userId, String(req.body.workId || ''), clientIp(req));
  setUserSessionCookie(res, session);
  res.json({ message: '投票成功', work: result.work, stats: result.stats, session: publicSessionPayload(session) });
}));

app.get('/api/rankings', asyncRoute(async (_req, res) => {
  const db = await readDb();
  res.json({ rankings: rankingFor(db), updatedAt: new Date().toISOString() });
}));

app.post('/api/visits', asyncRoute(async (req, res) => {
  const visitorId = String(req.headers['x-visitor-id'] || '').trim() || `anon_${crypto.randomBytes(4).toString('hex')}`;
  const routePath = String(req.body.path || '/');
  const counted = await recordVisit(visitorId, routePath, await phoneFrom(req));
  res.json({ ok: true, counted });
}));

app.post('/api/reports', asyncRoute(async (req, res) => {
  const workId = String(req.body.workId || '').trim();
  const reason = String(req.body.reason || '').trim();
  const description = String(req.body.description || '').trim();
  const contact = String(req.body.contact || '').trim();
  const visitorId = String(req.headers['x-visitor-id'] || '').trim() || `anon_${crypto.randomBytes(4).toString('hex')}`;
  const report = await createReport({
    workId,
    reason,
    description,
    contact,
    phone: await phoneFrom(req),
    visitorId
  });
  res.json({
    message: '举报已提交，主办方将核实处理。',
    report: {
      id: report.id,
      status: report.status
    }
  });
}));

app.post('/api/admin/login', asyncRoute(async (req, res) => {
  const result = await loginAdmin(String(req.body.username || ''), String(req.body.password || ''), res);
  res.json(result);
}));

app.post('/api/admin/logout', asyncRoute(async (req, res) => {
  await logoutAdmin(req, res);
  res.json({ ok: true });
}));

app.get('/api/admin/dashboard', requireAdmin, asyncRoute(async (_req, res) => {
  const db = await readDb();
  const day = beijingDay();
  const visits = dailyVisitStats(db);
  const todayVisit = visits.find((item) => item.day === day);
  const published = publicWorks(db);
  res.json({
    phase: getPhase(db.config),
    totalVotes: db.works.reduce((sum, work) => sum + work.votes, 0),
    todayVotes: todayVotes(db),
    voteUsers: voteUsers(db),
    publishedWorks: published.length,
    offlineWorks: db.works.filter((work) => work.status === 'offline').length,
    todayPV: todayVisit?.pv || 0,
    totalPV: db.visits.length,
    todayUV: todayVisit?.uv || 0,
    totalUV: uvCount(db.visits),
    updatedAt: new Date().toISOString()
  });
}));

app.get('/api/admin/users', requireAdmin, asyncRoute(async (req, res) => {
  res.json({ users: await listAdminUsers(String(req.query.search || '')) });
}));

app.get('/api/admin/users/:id/votes', requireAdmin, asyncRoute(async (req, res) => {
  res.json({ records: await getUserVotes(req.params.id) });
}));

app.patch('/api/admin/users/:id/status', requireAdmin, asyncRoute(async (req, res) => {
  const status = req.body.status === 'disabled' ? 'disabled' : 'active';
  await setUserStatus(res.locals.admin.id, req.params.id, status, clientIp(req));
  res.json({ ok: true, status });
}));

app.get('/api/admin/config', requireAdmin, asyncRoute(async (_req, res) => {
  const db = await readDb();
  res.json({ config: db.config, themes: db.themes });
}));

app.put('/api/admin/config', requireAdmin, asyncRoute(async (req, res) => {
  const result = await saveAdminConfig({ config: req.body.config, themes: req.body.themes });
  res.json(result);
}));

app.get('/api/admin/works', requireAdmin, asyncRoute(async (_req, res) => {
  const db = await readDb();
  res.json({ works: db.works.sort((a, b) => a.displayOrder - b.displayOrder) });
}));

app.post('/api/admin/works', requireAdmin, asyncRoute(async (req, res) => {
  const db = await readDb();
  const existing = db.works.find((work) => work.id === req.body.id || (req.body.code && work.code === req.body.code));
  if (!existing && db.works.length >= 25) {
    sendApiError(res, 409, '作品总数最多为25个，不能继续新增', 'WORK_LIMIT_REACHED');
    return;
  }
  if (existing && getPhase(db.config) !== 'pending') {
    sendApiError(res, 400, '投票已开始，已发布作品关键信息不可修改；如需隐藏请执行下架', 'WORK_EDIT_LOCKED');
    return;
  }
  const work = normalizeWork({ ...req.body, id: existing?.id || req.body.id }, db);
  work.votes = existing?.votes ?? 0;
  const saved = await persistWork(work);
  res.json({ work: saved });
}));

app.patch('/api/admin/works/:id/status', requireAdmin, asyncRoute(async (req, res) => {
  const work = await setWorkStatus(req.params.id, req.body.status === 'offline' ? 'offline' : 'published');
  res.json({ work });
}));

app.patch('/api/admin/works/batch', requireAdmin, asyncRoute(async (req, res) => {
  const db = await readDb();
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(String) : [];
  const status = req.body.status === 'published' || req.body.status === 'offline' ? req.body.status : undefined;
  const themeId = ['A', 'B', 'C', 'D'].includes(req.body.themeId) ? (req.body.themeId as ThemeId) : undefined;
  const category = typeof req.body.category === 'string' ? req.body.category.trim() : undefined;

  if (!ids.length) {
    sendApiError(res, 400, '请先选择作品', 'WORK_SELECTION_REQUIRED');
    return;
  }
  if (!status && !themeId && !category) {
    sendApiError(res, 400, '请选择批量操作', 'BATCH_ACTION_REQUIRED');
    return;
  }
  if (getPhase(db.config) !== 'pending' && (themeId || category)) {
    sendApiError(res, 400, '投票已开始，批量修改作品主题或类别会影响数据；当前仅允许批量发布/下架', 'BATCH_EDIT_LOCKED');
    return;
  }

  const result = await batchUpdateWorks({ ids, status, themeId, category });
  res.json(result);
}));

app.post('/api/admin/works/import-file', requireAdmin, upload.single('file'), asyncRoute(async (req, res) => {
  if (!req.file) {
    sendApiError(res, 400, '请选择要导入的 Excel、CSV 或 JSON 文件', 'IMPORT_FILE_REQUIRED');
    return;
  }

  let rows: Array<Partial<Work> & Record<string, unknown>>;
  try {
    rows = parseImportRowsFromFile(req.file) as Array<Partial<Work> & Record<string, unknown>>;
  } catch (error) {
    sendApiError(res, 400, error instanceof Error ? error.message : '文件解析失败', 'IMPORT_PARSE_ERROR');
    return;
  }

  if (!rows.length) {
    sendApiError(res, 400, '文件中没有可导入的数据', 'IMPORT_EMPTY');
    return;
  }

  const localized = await localizeImportAttachments(rows, uploadsDir);
  try {
    const result = await importAdminWorks(localized.rows);
    res.json({ ...result, rows: rows.length, filename: req.file.originalname });
  } catch (error) {
    await rollbackLocalizedFiles(localized.createdPaths);
    throw error;
  }
}));

app.post('/api/admin/upload', requireAdmin, upload.single('file'), asyncRoute(async (req, res) => {
  if (!req.file) {
    sendApiError(res, 400, '请选择文件', 'UPLOAD_FILE_REQUIRED');
    return;
  }
  const saved = await saveUploadedFile(req.file, uploadPurpose(req.body.purpose || req.query.purpose));
  res.json({ url: saved.url, filename: saved.filename, originalName: req.file.originalname });
}));

app.post('/api/admin/votes/reset', requireAdmin, asyncRoute(async (req, res) => {
  let sameOrigin = false;
  try { sameOrigin = new URL(req.get('origin') || '').origin === `${req.protocol}://${req.get('host')}`; } catch { /* Invalid origin stays rejected. */ }
  if (!sameOrigin || req.get('x-vote-reset-intent') !== 'confirmed') {
    sendApiError(res, 403, '请从本站管理后台执行清零', 'RESET_ORIGIN_REQUIRED');
    return;
  }
  const receipt = await resetAllVotes(res.locals.admin.id, clientIp(req), req.body.requestId, req.body.confirmation);
  res.json({ receipt });
}));

app.get('/api/admin/votes', requireAdmin, asyncRoute(async (_req, res) => {
  const db = await readDb();
  const records = db.votes
    .slice()
    .reverse()
    .map((vote) => ({
      ...vote,
      work: db.works.find((work) => work.id === vote.workId)
    }));
  res.json({ records });
}));

app.get('/api/admin/visits', requireAdmin, asyncRoute(async (_req, res) => {
  const db = await readDb();
  res.json({ daily: dailyVisitStats(db) });
}));

app.get('/api/admin/reports', requireAdmin, asyncRoute(async (_req, res) => {
  const db = await readDb();
  const records = db.reports.map((report) => ({
    ...report,
    work: db.works.find((work) => work.id === report.workId)
  }));
  res.json({ records });
}));

app.patch('/api/admin/reports/:id/status', requireAdmin, asyncRoute(async (req, res) => {
  const status = String(req.body.status || '').trim() as ReportStatus;
  if (!['pending', 'handled', 'ignored'].includes(status)) {
    sendApiError(res, 400, '举报状态不正确', 'INVALID_REPORT_STATUS');
    return;
  }
  const report = await setReportStatus(req.params.id, status);
  res.json({ report });
}));

app.get('/api/admin/export.xlsx', requireAdmin, asyncRoute(async (_req, res) => {
  const db = await readDb();
  const workbook = XLSX.utils.book_new();

  const themeIds = new Set(db.themes.map((theme) => theme.id));
  const workIds = new Set(db.works.map((work) => work.id));
  const integrityErrors: string[] = [];
  const integrityWarnings: string[] = [];

  if (!db.themes.length) integrityErrors.push('主题数据为空');
  if (!db.works.length) integrityErrors.push('作品数据为空');

  for (const work of db.works) {
    if (!themeIds.has(work.themeId)) integrityErrors.push(`作品 ${work.code} 关联的主题不存在：${work.themeId}`);
    if (!work.meta.category?.trim()) integrityWarnings.push(`作品 ${work.code} 未填写作品类别`);
  }

  for (const vote of db.votes) {
    if (!workIds.has(vote.workId)) integrityErrors.push(`投票记录 ${vote.id} 关联的作品不存在：${vote.workId}`);
  }

  for (const report of db.reports) {
    if (!workIds.has(report.workId)) integrityErrors.push(`举报记录 ${report.id} 关联的作品不存在：${report.workId}`);
  }

  const totalStoredVotes = db.works.reduce((sum, work) => sum + work.votes, 0);
  if (db.votes.length !== totalStoredVotes) {
    integrityWarnings.push(`作品累计票数 ${totalStoredVotes} 与投票明细 ${db.votes.length} 不一致，通常为历史初始票数或迁移数据导致`);
  }

  if (integrityWarnings.length) {
    console.warn(`[excel-export] integrity warnings: ${integrityWarnings.join('；')}`);
  }

  if (integrityErrors.length) {
    sendApiError(res, 409, '导出前数据完整性检查未通过', 'EXPORT_INTEGRITY_ERROR', { errors: integrityErrors });
    return;
  }

  const workStatusText: Record<Work['status'], string> = {
    published: '已发布',
    offline: '已下架'
  };

  const reportStatusText: Record<ReportStatus, string> = {
    pending: '待处理',
    handled: '已处理',
    ignored: '忽略'
  };

  const reportResultText: Record<ReportStatus, string> = {
    pending: '待核实处理',
    handled: '已完成处理',
    ignored: '已忽略'
  };

  const authorTeam = (work: Work) => (work.team?.trim() ? `${work.author} / ${work.team}` : work.author);
  const workCategory = (work: Work) => work.meta.category?.trim() || '未填写类别';

  const rankWorks = (works: Work[]) => {
    const sorted = [...works].sort((a, b) => {
      if (b.votes !== a.votes) return b.votes - a.votes;
      return a.displayOrder - b.displayOrder;
    });

    let lastVotes: number | undefined;
    let lastRank = 0;
    return sorted.map((work, index) => {
      if (lastVotes === undefined || work.votes !== lastVotes) {
        lastRank = index + 1;
        lastVotes = work.votes;
      }
      return { rank: lastRank, work };
    });
  };

  const appendSheet = (name: string, headers: string[], rows: Record<string, unknown>[]) => {
    const worksheet = rows.length ? XLSX.utils.json_to_sheet(rows, { header: headers }) : XLSX.utils.aoa_to_sheet([headers]);
    worksheet['!cols'] = headers.map((header) => ({ wch: Math.max(12, header.length * 2 + 4) }));
    XLSX.utils.book_append_sheet(workbook, worksheet, name);
  };

  const allRankingRows = rankWorks(db.works).map(({ rank, work }) => ({
    全场排名: rank,
    作品编号: work.code,
    作品名称: work.title,
    '作者/团队': authorTeam(work),
    作品主题: work.themeName,
    作品类别: workCategory(work),
    投票数量: work.votes,
    作品状态: workStatusText[work.status]
  }));

  const themeRankingRows = db.themes.flatMap((theme) =>
    rankWorks(db.works.filter((work) => work.themeId === theme.id)).map(({ rank, work }) => ({
      主题名称: theme.name,
      主题内排名: rank,
      作品编号: work.code,
      作品名称: work.title,
      '作者/团队': authorTeam(work),
      作品类别: workCategory(work),
      投票数量: work.votes,
      作品状态: workStatusText[work.status]
    }))
  );

  const voteDays = [...new Set(db.votes.map((vote) => vote.day))].sort((a, b) => a.localeCompare(b));
  let cumulativeVotes = 0;
  const dailyVoteRows = voteDays.map((day) => {
    const rows = db.votes.filter((vote) => vote.day === day);
    cumulativeVotes += rows.length;
    return {
      日期: day,
      当日新增投票数量: rows.length,
      当日投票用户数量: new Set(rows.map((vote) => vote.phone)).size,
      累计投票数量: cumulativeVotes
    };
  });

  let cumulativePV = 0;
  const visitRows = dailyVisitStats(db).map((row) => {
    cumulativePV += row.pv;
    return {
      日期: row.day,
      'PV（访问次数）': row.pv,
      'UV（访问用户数）': row.uv,
      总访问量统计: cumulativePV
    };
  });

  const reportRows = [...db.reports]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((report) => {
      const work = db.works.find((item) => item.id === report.workId);
      return {
        举报时间: report.createdAt,
        作品编号: work?.code || '',
        作品名称: work?.title || '',
        举报原因: report.reason,
        处理状态: reportStatusText[report.status],
        处理结果: reportResultText[report.status]
      };
    });

  appendSheet('全部作品排名', ['全场排名', '作品编号', '作品名称', '作者/团队', '作品主题', '作品类别', '投票数量', '作品状态'], allRankingRows);
  appendSheet('各主题作品排名', ['主题名称', '主题内排名', '作品编号', '作品名称', '作者/团队', '作品类别', '投票数量', '作品状态'], themeRankingRows);
  appendSheet('每日投票统计', ['日期', '当日新增投票数量', '当日投票用户数量', '累计投票数量'], dailyVoteRows);
  appendSheet('访问统计', ['日期', 'PV（访问次数）', 'UV（访问用户数）', '总访问量统计'], visitRows);
  appendSheet('举报记录', ['举报时间', '作品编号', '作品名称', '举报原因', '处理状态', '处理结果'], reportRows);

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  const fileName = encodeURIComponent(`北京市青年铸牢中华民族共同体意识文创设计大赛_投票数据汇总_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.xlsx`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${fileName}`);
  res.send(buffer);
}));

app.use('/api', (_req, res) => {
  sendApiError(res, 404, '接口不存在', 'API_NOT_FOUND');
});

if (fs.existsSync(clientDir)) {
  const pageTemplate=fs.readFileSync(path.join(clientDir,'index.html'),'utf8');
  // Public share crawlers generally do not execute the Vue application. Supply
  // work-specific metadata in HTML without exposing unpublished records.
  app.get('/work/:id', asyncRoute(async(req,res)=>{
    const work=await prisma.work.findUnique({where:{id:String(req.params.id)},select:{id:true,code:true,title:true,description:true,cover:true,status:true}});
    res.setHeader('Cache-Control','no-store');
    res.type('html').send(work?.status==='published'?workShareHtml(pageTemplate,work,'https://vote.wlbycuc.cn'):siteShareHtml(pageTemplate,'/vote','https://vote.wlbycuc.cn'));
  }));
  app.use('/share', express.static(path.join(clientDir,'share'), {maxAge:'365d',immutable:true}), (_req,res)=>res.status(404).type('text').send('图片不存在'));
  app.get(['/','/vote','/intro','/rank'], (req,res)=>{
    res.setHeader('Cache-Control','no-cache');
    res.type('html').send(siteShareHtml(pageTemplate,req.path,'https://vote.wlbycuc.cn'));
  });
  app.use(express.static(clientDir));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDir, 'index.html')));
}

app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = '服务暂时不可用，请稍后重试';

  if (error instanceof HttpError) {
    statusCode = error.statusCode;
    code = error.code;
    message = error.message;
  } else if (error instanceof multer.MulterError) {
    statusCode = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    code = error.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : 'UPLOAD_ERROR';
    message = error.code === 'LIMIT_FILE_SIZE' ? '上传文件过大' : '文件上传失败';
  } else if (error instanceof SyntaxError && 'status' in error && error.status === 400) {
    statusCode = 400;
    code = 'INVALID_JSON';
    message = '请求数据格式不正确';
  } else if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && /^P\d{4}$/.test(error.code)) {
    statusCode = error.code === 'P2025' ? 404 : error.code === 'P2002' ? 409 : 500;
    code = error.code === 'P2025' ? 'NOT_FOUND' : error.code === 'P2002' ? 'DATA_CONFLICT' : 'DATABASE_ERROR';
    message = statusCode === 404 ? '相关数据不存在' : statusCode === 409 ? '数据已存在或发生冲突' : message;
  } else if (error instanceof Error) {
    statusCode = 400;
    code = 'BAD_REQUEST';
    message = error.message || '请求失败，请稍后重试';
  }

  if (statusCode >= 500) {
    console.error(`[api-error] ${req.method} ${req.path}`, error);
  }
  res.status(statusCode).json({ message, code });
});

app.listen(port, host, () => {
  console.log(`API server listening on ${host}:${port}`);
});
