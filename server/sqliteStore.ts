import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import SQLite, { type Database as SQLiteConnection } from 'better-sqlite3';
import { defaultNotice } from './defaultNotice.js';

export type ThemeId = 'A' | 'B' | 'C' | 'D';
export type WorkStatus = 'published' | 'offline';
export type WorkType = 'image' | 'video';
export type ReportStatus = 'pending' | 'handled' | 'ignored';

export interface Theme {
  id: ThemeId;
  prefix: string;
  name: string;
  description: string;
  order: number;
}

export interface ContestConfig {
  title: string;
  shortTitle: string;
  slogan: string;
  introSubtitle: string;
  introDescription: string;
  organizerText: string[];
  voteStart: string;
  voteEnd: string;
  rules: string;
  notice: string;
  retentionNote: string;
  totalViewsLabel: string;
}

export interface WorkMedia {
  id: string;
  type: 'image' | 'video';
  url: string;
  poster?: string;
  title?: string;
  order: number;
}

export interface Work {
  id: string;
  code: string;
  title: string;
  author: string;
  team?: string;
  themeId: ThemeId;
  themeName: string;
  type: WorkType;
  cover: string;
  description: string;
  status: WorkStatus;
  votes: number;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
  meta: {
    category?: string;
    createdTime?: string;
    advisor?: string;
    school?: string;
  };
  media: WorkMedia[];
}

const workCategoryOptions = ['视觉设计', '实物设计', '数字设计'] as const;

function normalizeWorkCategory(value?: string) {
  const category = value?.trim().replace(/类$/, '');
  if (category && workCategoryOptions.includes(category as (typeof workCategoryOptions)[number])) return category;
  if (category?.includes('实物')) return '实物设计';
  if (category?.includes('数字')) return '数字设计';
  return '视觉设计';
}

export interface VoteRecord {
  id: string;
  phone: string;
  workId: string;
  themeId: ThemeId;
  createdAt: string;
  day: string;
}

export interface VisitRecord {
  id: string;
  visitorId: string;
  phone?: string;
  path: string;
  createdAt: string;
  day: string;
}

export interface ReportRecord {
  id: string;
  workId: string;
  reason: string;
  description?: string;
  contact?: string;
  phone?: string;
  visitorId: string;
  status: ReportStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Database {
  config: ContestConfig;
  themes: Theme[];
  works: Work[];
  votes: VoteRecord[];
  visits: VisitRecord[];
  reports: ReportRecord[];
}

type ConfigRow = { value: string };
type CountRow = { count: number };
type ThemeRow = {
  id: ThemeId;
  prefix: string;
  name: string;
  description: string;
  sort_order: number;
};
type WorkRow = {
  id: string;
  code: string;
  title: string;
  author: string;
  team: string | null;
  theme_id: ThemeId;
  theme_name: string;
  type: WorkType;
  cover: string;
  description: string;
  status: WorkStatus;
  votes: number;
  display_order: number;
  created_at: string;
  updated_at: string;
  meta_json: string | null;
};
type MediaRow = {
  id: string;
  work_id: string;
  type: 'image' | 'video';
  url: string;
  poster: string | null;
  title: string | null;
  sort_order: number;
};
type VoteRow = {
  id: string;
  phone: string;
  work_id: string;
  theme_id: ThemeId;
  created_at: string;
  day: string;
};
type VisitRow = {
  id: string;
  visitor_id: string;
  phone: string | null;
  path: string;
  created_at: string;
  day: string;
};
type ReportRow = {
  id: string;
  work_id: string;
  reason: string;
  description: string | null;
  contact: string | null;
  phone: string | null;
  visitor_id: string;
  status: ReportStatus;
  created_at: string;
  updated_at: string;
};

const dataDir = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
const sqlitePath = path.resolve(process.env.DB_PATH || path.join(dataDir, 'vote.sqlite'));
const legacyJsonPath = path.join(dataDir, 'db.json');

let sqlite: SQLiteConnection | undefined;

function nowIso() {
  return new Date().toISOString();
}

export function beijingDay(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

export function getPhase(config: ContestConfig, date = new Date()): 'pending' | 'active' | 'ended' {
  const now = date.getTime();
  const start = new Date(config.voteStart).getTime();
  const end = new Date(config.voteEnd).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 'pending';
  if (now < start) return 'pending';
  if (now > end) return 'ended';
  return 'active';
}

function id(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

const themes: Theme[] = [
  {
    id: 'A',
    prefix: 'A',
    name: '法治护航・同心普法',
    description: '围绕法治宣传、普法教育与共同体意识表达，展示青年文创对公共传播和社会参与的创新理解。',
    order: 1
  },
  {
    id: 'B',
    prefix: 'B',
    name: '文脉共传・同心筑梦',
    description: '围绕中华优秀传统文化传承、北京文化表达和现代创意融合，呈现青年群体的文化想象力。',
    order: 2
  },
  {
    id: 'C',
    prefix: 'C',
    name: '青春同行・铸牢根基',
    description: '围绕青年参与、校园传播和民族团结进步教育，展现共同成长、共同创造的青春力量。',
    order: 3
  },
  {
    id: 'D',
    prefix: 'D',
    name: '品牌焕新・融聚活力',
    description: '围绕品牌形象、视觉识别和传播载体更新，探索共同体意识在当代表达中的活力转化。',
    order: 4
  }
];

const defaultConfig: ContestConfig = {
  title: '北京市青年铸牢中华民族共同体意识文创设计大赛',
  shortTitle: '北京市青年铸牢中华民族共同体意识文创设计大赛',
  slogan: '铸牢共同体 文创赋新篇',
  introSubtitle: '铸牢共同体·文创赋新篇',
  introDescription:
    '本次大赛以铸牢中华民族共同体意识为主线，围绕北京城市文化、中华优秀传统文化与青年文创表达，集中展示青年群体的创意作品。',
  organizerText: [
    '主办单位：北京市民族宗教事务委员会；北京市教育委员会',
    '承办单位：中国传媒大学',
    '执行单位：北京市民族团结进步促进中心；中国传媒大学艺术研究院；中央四部委铸牢中华民族共同体意识研究基地（中国传媒大学）'
  ],
  voteStart: '',
  voteEnd: '',
  rules:
    '每人每天共12票，每个主题每天3票；点击一次投1票，投票成功后不可撤回、不可改投。系统禁止机器、外挂、脚本、刷票等非正常投票行为。',
  notice: defaultNotice,
  retentionNote: '投票结束后H5预计保留约一个月，最终下线时间由主办方后续确定。',
  totalViewsLabel: '累计浏览次数'
};

const placeholderNotice =
  '本页面用于展示北京市青年铸牢中华民族共同体意识文创设计大赛相关信息。正式比赛通知全文及配图由主办方提供后，可在后台进行维护并同步到公众端。';


function defaultDb(): Database {
  return {
    config: defaultConfig,
    themes,
    works: [],
    votes: [],
    visits: [],
    reports: []
  };
}

function safeJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizeDatabase(parsed: Partial<Database>): Database {
  const config = {
    ...defaultConfig,
    ...(parsed.config || {})
  };
  if (config.notice === placeholderNotice) {
    config.notice = defaultNotice;
  }
  return {
    config,
    themes: parsed.themes?.length ? parsed.themes : themes,
    works: parsed.works || [],
    votes: parsed.votes || [],
    visits: parsed.visits || [],
    reports: parsed.reports || []
  };
}

function loadInitialData() {
  if (fs.existsSync(legacyJsonPath)) {
    try {
      return normalizeDatabase(JSON.parse(fs.readFileSync(legacyJsonPath, 'utf8')) as Partial<Database>);
    } catch {
      return defaultDb();
    }
  }
  return defaultDb();
}

function getConnection() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!sqlite) {
    sqlite = new SQLite(sqlitePath);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
  }
  return sqlite;
}

function createSchema(db: SQLiteConnection) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS themes (
      id TEXT PRIMARY KEY,
      prefix TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      sort_order INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS works (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      team TEXT,
      theme_id TEXT NOT NULL,
      theme_name TEXT NOT NULL,
      type TEXT NOT NULL,
      cover TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL,
      votes INTEGER NOT NULL DEFAULT 0,
      display_order INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      meta_json TEXT
    );

    CREATE TABLE IF NOT EXISTS work_media (
      id TEXT PRIMARY KEY,
      work_id TEXT NOT NULL,
      type TEXT NOT NULL,
      url TEXT NOT NULL,
      poster TEXT,
      title TEXT,
      sort_order INTEGER NOT NULL,
      FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS votes (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL,
      work_id TEXT NOT NULL,
      theme_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      day TEXT NOT NULL,
      FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS visits (
      id TEXT PRIMARY KEY,
      visitor_id TEXT NOT NULL,
      phone TEXT,
      path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      day TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      work_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      description TEXT,
      contact TEXT,
      phone TEXT,
      visitor_id TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_works_status_order ON works(status, display_order);
    CREATE INDEX IF NOT EXISTS idx_works_theme ON works(theme_id);
    CREATE INDEX IF NOT EXISTS idx_votes_phone_day ON votes(phone, day);
    CREATE INDEX IF NOT EXISTS idx_votes_work ON votes(work_id);
    CREATE INDEX IF NOT EXISTS idx_visits_day ON visits(day);
    CREATE INDEX IF NOT EXISTS idx_visits_identity ON visits(visitor_id, phone, path, created_at);
    CREATE INDEX IF NOT EXISTS idx_reports_work ON reports(work_id);
    CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
  `);
}

function isDatabaseEmpty(db: SQLiteConnection) {
  const row = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM app_config) +
        (SELECT COUNT(*) FROM themes) +
        (SELECT COUNT(*) FROM works) +
        (SELECT COUNT(*) FROM votes) +
        (SELECT COUNT(*) FROM visits) +
        (SELECT COUNT(*) FROM reports) AS count`
    )
    .get() as CountRow;
  return row.count === 0;
}

function replaceAll(db: SQLiteConnection, data: Database) {
  const run = db.transaction((payload: Database) => {
    db.exec(`
      DELETE FROM work_media;
      DELETE FROM votes;
      DELETE FROM visits;
      DELETE FROM reports;
      DELETE FROM works;
      DELETE FROM themes;
      DELETE FROM app_config;
    `);

    db.prepare('INSERT INTO app_config (key, value) VALUES (?, ?)').run('config', JSON.stringify(payload.config));

    const insertTheme = db.prepare(`
      INSERT INTO themes (id, prefix, name, description, sort_order)
      VALUES (@id, @prefix, @name, @description, @order)
    `);
    for (const theme of payload.themes) insertTheme.run(theme);

    const insertWork = db.prepare(`
      INSERT INTO works (
        id, code, title, author, team, theme_id, theme_name, type, cover, description,
        status, votes, display_order, created_at, updated_at, meta_json
      )
      VALUES (
        @id, @code, @title, @author, @team, @themeId, @themeName, @type, @cover, @description,
        @status, @votes, @displayOrder, @createdAt, @updatedAt, @metaJson
      )
    `);
    const insertMedia = db.prepare(`
      INSERT INTO work_media (id, work_id, type, url, poster, title, sort_order)
      VALUES (@id, @workId, @type, @url, @poster, @title, @order)
    `);

    for (const work of payload.works) {
      insertWork.run({
        ...work,
        team: work.team || null,
        metaJson: JSON.stringify(work.meta || {})
      });
      for (const media of work.media || []) {
        insertMedia.run({
          ...media,
          workId: work.id,
          poster: media.poster || null,
          title: media.title || null
        });
      }
    }

    const insertVote = db.prepare(`
      INSERT INTO votes (id, phone, work_id, theme_id, created_at, day)
      VALUES (@id, @phone, @workId, @themeId, @createdAt, @day)
    `);
    for (const vote of payload.votes) insertVote.run(vote);

    const insertVisit = db.prepare(`
      INSERT INTO visits (id, visitor_id, phone, path, created_at, day)
      VALUES (@id, @visitorId, @phone, @path, @createdAt, @day)
    `);
    for (const visit of payload.visits) {
      insertVisit.run({
        ...visit,
        phone: visit.phone || null
      });
    }

    const insertReport = db.prepare(`
      INSERT INTO reports (
        id, work_id, reason, description, contact, phone, visitor_id, status, created_at, updated_at
      )
      VALUES (
        @id, @workId, @reason, @description, @contact, @phone, @visitorId, @status, @createdAt, @updatedAt
      )
    `);
    for (const report of payload.reports || []) {
      insertReport.run({
        ...report,
        description: report.description || null,
        contact: report.contact || null,
        phone: report.phone || null
      });
    }
  });

  run(data);
}

export function ensureDb() {
  const db = getConnection();
  createSchema(db);
  if (isDatabaseEmpty(db)) {
    replaceAll(db, loadInitialData());
  }
}

function loadThemes(db: SQLiteConnection) {
  const rows = db.prepare('SELECT * FROM themes ORDER BY sort_order ASC').all() as ThemeRow[];
  return rows.map((row) => ({
    id: row.id,
    prefix: row.prefix,
    name: row.name,
    description: row.description,
    order: row.sort_order
  }));
}

function loadMedia(db: SQLiteConnection, workId: string) {
  const rows = db.prepare('SELECT * FROM work_media WHERE work_id = ? ORDER BY sort_order ASC').all(workId) as MediaRow[];
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    url: row.url,
    poster: row.poster || undefined,
    title: row.title || undefined,
    order: row.sort_order
  }));
}

function loadWorks(db: SQLiteConnection) {
  const rows = db.prepare('SELECT * FROM works ORDER BY display_order ASC').all() as WorkRow[];
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    title: row.title,
    author: row.author,
    team: row.team || undefined,
    themeId: row.theme_id,
    themeName: row.theme_name,
    type: row.type,
    cover: row.cover,
    description: row.description,
    status: row.status,
    votes: row.votes,
    displayOrder: row.display_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    meta: {
      ...safeJson<Work['meta']>(row.meta_json, {}),
      category: normalizeWorkCategory(safeJson<Work['meta']>(row.meta_json, {}).category)
    },
    media: loadMedia(db, row.id)
  }));
}

function loadVotes(db: SQLiteConnection) {
  const rows = db.prepare('SELECT * FROM votes ORDER BY created_at ASC').all() as VoteRow[];
  return rows.map((row) => ({
    id: row.id,
    phone: row.phone,
    workId: row.work_id,
    themeId: row.theme_id,
    createdAt: row.created_at,
    day: row.day
  }));
}

function loadVisits(db: SQLiteConnection) {
  const rows = db.prepare('SELECT * FROM visits ORDER BY created_at ASC').all() as VisitRow[];
  return rows.map((row) => ({
    id: row.id,
    visitorId: row.visitor_id,
    phone: row.phone || undefined,
    path: row.path,
    createdAt: row.created_at,
    day: row.day
  }));
}

function loadReports(db: SQLiteConnection) {
  const rows = db.prepare('SELECT * FROM reports ORDER BY created_at DESC').all() as ReportRow[];
  return rows.map((row) => ({
    id: row.id,
    workId: row.work_id,
    reason: row.reason,
    description: row.description || undefined,
    contact: row.contact || undefined,
    phone: row.phone || undefined,
    visitorId: row.visitor_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

export function readDb(): Database {
  ensureDb();
  const db = getConnection();
  const configRow = db.prepare('SELECT value FROM app_config WHERE key = ?').get('config') as ConfigRow | undefined;
  const config = {
    ...defaultConfig,
    ...safeJson<Partial<ContestConfig>>(configRow?.value, {})
  };
  if (config.notice === placeholderNotice) {
    config.notice = defaultNotice;
  }

  return {
    config,
    themes: loadThemes(db),
    works: loadWorks(db),
    votes: loadVotes(db),
    visits: loadVisits(db),
    reports: loadReports(db)
  };
}

export function writeDb(dbData: Database) {
  const db = getConnection();
  createSchema(db);
  replaceAll(db, dbData);
}

export function publicWorks(db: Database) {
  return db.works.filter((work) => work.status === 'published');
}

export function stats(db: Database) {
  const works = publicWorks(db);
  return {
    totalVotes: works.reduce((sum, work) => sum + work.votes, 0),
    workCount: works.length,
    candidateCount: works.length,
    totalViews: db.visits.length
  };
}

export function rankingFor(db: Database, theme: 'all' | ThemeId) {
  const works = publicWorks(db)
    .filter((work) => theme === 'all' || work.themeId === theme)
    .sort((a, b) => {
      if (b.votes !== a.votes) return b.votes - a.votes;
      return a.displayOrder - b.displayOrder;
    });

  let lastVotes: number | undefined;
  let lastRank = 0;
  return works.map((work, index) => {
    if (lastVotes === undefined || work.votes !== lastVotes) {
      lastRank = index + 1;
      lastVotes = work.votes;
    }
    return { rank: lastRank, work };
  });
}

export function addVote(db: Database, phone: string, work: Work) {
  const day = beijingDay();
  const themeVotes = db.votes.filter((vote) => vote.phone === phone && vote.day === day && vote.themeId === work.themeId).length;
  const totalVotes = db.votes.filter((vote) => vote.phone === phone && vote.day === day).length;

  if (themeVotes >= 3 || totalVotes >= 12) {
    throw new Error('票数已用完，明天再来～');
  }

  const target = db.works.find((item) => item.id === work.id);
  if (!target || target.status !== 'published') {
    throw new Error('当前作品暂不可投票');
  }

  const record: VoteRecord = {
    id: id('vote'),
    phone,
    workId: target.id,
    themeId: target.themeId,
    createdAt: nowIso(),
    day
  };
  db.votes.push(record);
  target.votes += 1;
  target.updatedAt = nowIso();
  return target;
}

const visitDedupeWindowMs = 5 * 60 * 1000;

function visitIdentity(visit: Pick<VisitRecord, 'phone' | 'visitorId'>) {
  return visit.phone ? `phone:${visit.phone}` : `visitor:${visit.visitorId}`;
}

export function uvCount(records: VisitRecord[]) {
  const phones = new Set<string>();
  const visitorsWithPhone = new Set<string>();
  const anonymousVisitors = new Set<string>();

  for (const record of records) {
    if (record.phone) {
      phones.add(record.phone);
      visitorsWithPhone.add(record.visitorId);
    }
  }

  for (const record of records) {
    if (!record.phone && !visitorsWithPhone.has(record.visitorId)) {
      anonymousVisitors.add(record.visitorId);
    }
  }

  return phones.size + anonymousVisitors.size;
}

export function addVisit(db: Database, visitorId: string, pathName: string, phone?: string) {
  const now = new Date();
  const identity = phone ? `phone:${phone}` : `visitor:${visitorId}`;
  const recentDuplicate = db.visits.some((visit) => {
    if (visit.path !== pathName) return false;
    if (visitIdentity(visit) !== identity) return false;
    return now.getTime() - new Date(visit.createdAt).getTime() < visitDedupeWindowMs;
  });

  if (recentDuplicate) return false;

  db.visits.push({
    id: id('visit'),
    visitorId,
    phone,
    path: pathName,
    createdAt: now.toISOString(),
    day: beijingDay(now)
  });
  return true;
}

const reportDedupeWindowMs = 10 * 60 * 1000;

function reportIdentity(report: Pick<ReportRecord, 'phone' | 'visitorId'>) {
  return report.phone ? `phone:${report.phone}` : `visitor:${report.visitorId}`;
}

export function addReport(
  db: Database,
  input: {
    work: Work;
    reason: string;
    description?: string;
    contact?: string;
    phone?: string;
    visitorId: string;
  }
) {
  const now = new Date();
  const reason = input.reason.trim();
  const description = input.description?.trim();
  const contact = input.contact?.trim();
  const identity = input.phone ? `phone:${input.phone}` : `visitor:${input.visitorId}`;

  if (!reason) {
    throw new Error('请选择举报原因');
  }

  const recentDuplicate = db.reports.some((report) => {
    if (report.workId !== input.work.id) return false;
    if (reportIdentity(report) !== identity) return false;
    return now.getTime() - new Date(report.createdAt).getTime() < reportDedupeWindowMs;
  });

  if (recentDuplicate) {
    throw new Error('举报提交太频繁，请稍后再试');
  }

  const report: ReportRecord = {
    id: id('report'),
    workId: input.work.id,
    reason: reason.slice(0, 50),
    description: description ? description.slice(0, 500) : undefined,
    contact: contact ? contact.slice(0, 80) : undefined,
    phone: input.phone,
    visitorId: input.visitorId,
    status: 'pending',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };

  db.reports.push(report);
  return report;
}

export function dailyVisitStats(db: Database) {
  const grouped = new Map<string, VisitRecord[]>();
  for (const visit of db.visits) {
    grouped.set(visit.day, [...(grouped.get(visit.day) || []), visit]);
  }
  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, rows]) => ({
      day,
      pv: rows.length,
      uv: uvCount(rows)
    }));
}

export function todayVotes(db: Database) {
  const day = beijingDay();
  return db.votes.filter((vote) => vote.day === day).length;
}

export function voteUsers(db: Database) {
  return new Set(db.votes.map((vote) => vote.phone)).size;
}

export function normalizeWork(input: Partial<Work>, db: Database): Work {
  const existing = input.id ? db.works.find((work) => work.id === input.id) : undefined;
  const themeId = (input.themeId || existing?.themeId || 'A') as ThemeId;
  const theme = db.themes.find((item) => item.id === themeId) || db.themes[0];
  const now = nowIso();
  const code = input.code || existing?.code || `${theme.prefix}${String(db.works.length + 1).padStart(3, '0')}`;
  const rawCategory = (input as Partial<Work> & { category?: string }).category;
  const meta = {
    ...existing?.meta,
    ...input.meta,
    category: normalizeWorkCategory(input.meta?.category || rawCategory || existing?.meta.category)
  };
  return {
    id: input.id || existing?.id || `work_${code}_${crypto.randomBytes(3).toString('hex')}`,
    code,
    title: input.title || existing?.title || '未命名作品',
    author: input.author || existing?.author || '未填写',
    team: input.team ?? existing?.team,
    themeId: theme.id,
    themeName: theme.name,
    type: input.type || existing?.type || 'image',
    cover: input.cover || existing?.cover || '',
    description: input.description || existing?.description || '作品说明待补充。',
    status: input.status || existing?.status || 'published',
    votes: typeof input.votes === 'number' ? input.votes : existing?.votes || 0,
    displayOrder: typeof input.displayOrder === 'number' ? input.displayOrder : existing?.displayOrder || db.works.length + 1,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    meta,
    media: input.media?.length
      ? input.media
      : existing?.media || [
          {
            id: `media_${code}_cover`,
            type: input.type === 'video' ? 'video' : 'image',
            url: input.cover || '',
            poster: input.cover || '',
            order: 1
          }
        ]
  };
}
