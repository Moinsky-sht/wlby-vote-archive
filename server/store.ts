import crypto from 'node:crypto';
import { lockVoteEpoch } from './voteReset.js';
import { contestPhase, contestTimestamp, normalizeContestTime } from './contestTime.js';
import { lockKeys, networkHash, voteAllowance, votingRules } from './antiAbuse.js';
import { forbidden, tooManyRequests } from './httpError.js';
import { prisma } from './prisma.js';
import type {
  Prisma,
  Report as PrismaReport,
  Theme as PrismaTheme,
  User as PrismaUser,
  Visit as PrismaVisit,
  VoteRecord as PrismaVoteRecord,
  Work as PrismaWork,
  WorkMedia as PrismaWorkMedia
} from './generated/prisma/client.js';
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
    contact?: string;
    notes?: string;
    larkAttachments?: Record<string, unknown>;
    [key: string]: unknown;
  };
  media: WorkMedia[];
}

export interface VoteRecord {
  id: string;
  userId?: string;
  phone: string;
  workId: string;
  themeId: ThemeId;
  createdAt: string;
  day: string;
}

export interface UserSession {
  userId: string;
  phone: string;
  token: string;
  expiresAt: string;
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

const workCategoryOptions = ['视觉设计', '实物设计', '数字设计'] as const;

function normalizeWorkCategory(value?: string) {
  const category = value?.trim().replace(/类$/, '');
  if (category && workCategoryOptions.includes(category as (typeof workCategoryOptions)[number])) return category;
  if (category?.includes('实物')) return '实物设计';
  if (category?.includes('数字')) return '数字设计';
  return '视觉设计';
}

export type ImportRow = Partial<Work> & Record<string, unknown>;

interface AttachmentRef {
  name?: string;
  url?: string;
  fileToken?: string;
  raw?: unknown;
}

const larkFieldAliases = {
  code: ['code', '作品编号', '系统作品编号', '作品序号', '序号', '编号', 'fldAwd6hoU', 'fldS1UdMf9', 'fldFDujFuj'],
  title: ['title', '作品名称', '作品标题', 'fldK4wjsFI'],
  author: ['author', '作者/团队负责人', '作者/团队', '作者', '负责人', 'fldBudvh2l'],
  team: ['team', '小组/团队名称', '小组名称', '团队名称', 'fldI0deKc9'],
  theme: ['themeId', 'themeName', '作品主题', '所属主题', '主题', 'theme', 'fldZCIKNNs'],
  category: ['category', '作品类别', '类别', 'fldEnqRAXy'],
  form: ['type', '作品形式', '形式', 'fldiMYqdSm'],
  school: ['所属单位/学校', '单位/学校', '学校', '单位', 'fldwIIlcAb'],
  advisor: ['指导老师', '导师', 'fldssBEuYD'],
  createdTime: ['创作时间', '完成时间', 'fldEMnIrp9'],
  contact: ['联系电话', '联系方式', '手机号', 'fldEg3w7zj'],
  description: ['description', '作品说明', '作品简介', '说明', 'fldIGWg7NB'],
  cover: [
    'cover',
    '作品首张海报（A3竖版）',
    '作品首张海报',
    'A3竖版海报',
    '封面图横版 4:3',
    '封面图',
    '作品封面图',
    'fldhiJATnV'
  ],
  media: ['media', '作品附件', '附件', '作品文件', 'fldVI5nS5B'],
  extraAttachments: ['其他附件/授权材料', '授权材料', '其他附件', 'fldpMSNB0i'],
  notes: ['备注', '导入备注', 'notes', 'fldjUKEvhV', 'fldXQdks59'],
  displayOrder: ['displayOrder', '展示顺序', '排序', '导入排序'],
  status: ['status', '作品状态']
} as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function importFields(input: ImportRow) {
  if (isObject(input.fields)) return input.fields;
  if (isObject(input.record) && isObject(input.record.fields)) return input.record.fields;
  return input;
}

function fieldValue(fields: Record<string, unknown>, aliases: readonly string[]) {
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(fields, alias)) return fields[alias];
  }
  const normalized = new Map(Object.keys(fields).map((key) => [key.trim().toLowerCase(), key]));
  for (const alias of aliases) {
    const key = normalized.get(alias.trim().toLowerCase());
    if (key) return fields[key];
  }
  return undefined;
}

function valueToText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(valueToText).filter(Boolean).join('，');
  if (isObject(value)) {
    for (const key of ['text', 'name', 'title', 'value', 'url', 'tmp_url', 'download_url', 'file_url', 'link']) {
      const text = valueToText(value[key]);
      if (text) return text;
    }
  }
  return '';
}

function cleanText(value: unknown) {
  const text = valueToText(value).trim();
  return text || undefined;
}

function looksLikeUsableUrl(value?: string) {
  if (!value) return false;
  return /^(https?:)?\/\//i.test(value) || value.startsWith('/assets/') || value.startsWith('/uploads/');
}

function collectAttachments(value: unknown): AttachmentRef[] {
  if (value === null || value === undefined || value === '') return [];
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return [];
    if (/^[\[{]/.test(text)) {
      try {
        return collectAttachments(JSON.parse(text));
      } catch {
        // Fall through to URL/text handling.
      }
    }
    const urls = text.match(/https?:\/\/[^\s，,;；]+/g);
    if (urls?.length) return urls.map((url) => ({ url, raw: value }));
    return [{ ...(looksLikeUsableUrl(text) ? { url: text } : { name: text }), raw: value }];
  }
  if (Array.isArray(value)) return value.flatMap(collectAttachments);
  if (!isObject(value)) return [];

  const url = cleanText(value.url) || cleanText(value.tmp_url) || cleanText(value.download_url) || cleanText(value.file_url) || cleanText(value.link);
  const name = cleanText(value.name) || cleanText(value.title) || cleanText(value.file_name) || cleanText(value.text);
  const fileToken = cleanText(value.file_token) || cleanText(value.fileToken) || cleanText(value.token);
  return [{ name, url: looksLikeUsableUrl(url) ? url : undefined, fileToken, raw: value }];
}

function firstAttachmentUrl(...values: unknown[]) {
  for (const value of values) {
    const url = collectAttachments(value).find((item) => item.url)?.url || cleanText(value);
    if (looksLikeUsableUrl(url)) return url;
  }
  return undefined;
}

function normalizeImportThemeId(value: unknown, db: Database, fallback?: ThemeId) {
  const text = cleanText(value);
  if (!text) {
    if (fallback && db.themes.some((theme) => theme.id === fallback)) return fallback;
    throw new Error('未填写作品主题');
  }

  const directId = text.toUpperCase().match(/^(?:主题\s*)?([A-D])$/)?.[1] as ThemeId | undefined;
  if (directId && db.themes.some((theme) => theme.id === directId)) return directId;
  const byName = db.themes.find((theme) => text === theme.name || text.includes(theme.name));
  if (byName) return byName.id;
  throw new Error(`无法识别作品主题“${text}”，请填写完整主题名称或 A/B/C/D`);
}

function normalizeImportType(value: unknown): WorkType {
  const text = cleanText(value);
  return text?.includes('视频') ? 'video' : 'image';
}

function normalizeImportStatus(value: unknown): WorkStatus | undefined {
  const text = cleanText(value);
  if (!text) return undefined;
  return text.includes('下架') || text.toLowerCase().includes('offline') ? 'offline' : 'published';
}

function mediaTypeForUrl(url: string, fallback: WorkType): 'image' | 'video' {
  return /\.(mp4|mov|webm)(\?.*)?$/i.test(url) || fallback === 'video' ? 'video' : 'image';
}

function buildImportedMedia(code: string, coverUrl: string | undefined, mediaValue: unknown, workType: WorkType) {
  const attachments = collectAttachments(mediaValue).filter((item) => item.url);
  const media: WorkMedia[] = [];
  if (coverUrl) {
    media.push({
      id: `media_${code}_cover`,
      type: 'image',
      url: coverUrl,
      poster: coverUrl,
      title: '作品首张海报（A3竖版）',
      order: 1
    });
  }

  attachments.forEach((attachment, index) => {
    const url = attachment.url!;
    if (url === coverUrl) return;
    const type = mediaTypeForUrl(url, workType);
    media.push({
      id: `media_${code}_${index + 2}`,
      type,
      url,
      poster: type === 'video' ? coverUrl : undefined,
      title: attachment.name,
      order: media.length + 1
    });
  });

  return media.length ? media : undefined;
}

function normalizeImportedWorkInput(input: ImportRow, db: Database): Partial<Work> {
  const fields = importFields(input);
  const code = cleanText(fieldValue(fields, larkFieldAliases.code));
  const workType = normalizeImportType(fieldValue(fields, larkFieldAliases.form) ?? input.type);
  const coverValue = fieldValue(fields, larkFieldAliases.cover);
  const mediaValue = fieldValue(fields, larkFieldAliases.media);
  const extraAttachmentValue = fieldValue(fields, larkFieldAliases.extraAttachments);
  const coverUrl = firstAttachmentUrl(coverValue, input.cover);
  const media = input.media?.length ? input.media : buildImportedMedia(code || 'import', coverUrl, mediaValue, workType);
  const attachmentMeta = {
    cover: collectAttachments(coverValue),
    media: collectAttachments(mediaValue),
    extra: collectAttachments(extraAttachmentValue)
  };
  const hasAttachmentMeta = Object.values(attachmentMeta).some((items) => items.length > 0);
  const existing = db.works.find((work) => work.id === input.id || (code && work.code === code));
  const title = cleanText(fieldValue(fields, larkFieldAliases.title)) || input.title || existing?.title;
  const author = cleanText(fieldValue(fields, larkFieldAliases.author)) || input.author || existing?.author;
  const category = cleanText(fieldValue(fields, larkFieldAliases.category)) || input.meta?.category || existing?.meta.category;
  if (!title) throw new Error('未填写作品名称');
  if (!author) throw new Error('未填写作者/团队');
  if (!category) throw new Error('未填写作品类别');

  return {
    ...input,
    code: code || input.code,
    title,
    author,
    team: cleanText(fieldValue(fields, larkFieldAliases.team)) || input.team,
    themeId: normalizeImportThemeId(fieldValue(fields, larkFieldAliases.theme) ?? input.themeId, db, existing?.themeId),
    type: workType,
    cover: coverUrl || input.cover,
    description: cleanText(fieldValue(fields, larkFieldAliases.description)) || input.description,
    status: normalizeImportStatus(fieldValue(fields, larkFieldAliases.status)) || input.status,
    displayOrder: Number(fieldValue(fields, larkFieldAliases.displayOrder)) || input.displayOrder,
    meta: {
      ...(isObject(input.meta) ? input.meta : {}),
      category: normalizeWorkCategory(category),
      school: cleanText(fieldValue(fields, larkFieldAliases.school)) || input.meta?.school,
      advisor: cleanText(fieldValue(fields, larkFieldAliases.advisor)) || input.meta?.advisor,
      createdTime: cleanText(fieldValue(fields, larkFieldAliases.createdTime)) || input.meta?.createdTime,
      contact: cleanText(fieldValue(fields, larkFieldAliases.contact)) || input.meta?.contact,
      notes: cleanText(fieldValue(fields, larkFieldAliases.notes)) || input.meta?.notes,
      ...(hasAttachmentMeta ? { larkAttachments: attachmentMeta } : {})
    },
    ...(media ? { media } : {})
  };
}

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
  return contestPhase(config, date.getTime());
}

function id(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

function tokenHash(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createSessionToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function tokenExpiresAt(config: ContestConfig, now = new Date()) {
  const voteEnd = new Date(contestTimestamp(config.voteEnd));
  if (Number.isNaN(voteEnd.getTime())) return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const activityExpiry = new Date(voteEnd.getTime() + 7 * 24 * 60 * 60 * 1000);
  return activityExpiry.getTime() > now.getTime() ? activityExpiry : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
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
  slogan: '铸牢共同体 文创赋新篇——中华优秀传统文化与现代创意融合实践',
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
  rules: votingRules,
  notice: defaultNotice,
  retentionNote: '投票结束后H5预计保留约一个月，最终下线时间由主办方后续确定。',
  totalViewsLabel: '累计浏览次数'
};

const placeholderNotice =
  '本页面用于展示北京市青年铸牢中华民族共同体意识文创设计大赛相关信息。正式比赛通知全文及配图由主办方提供后，可在后台进行维护并同步到公众端。';

type WorkWithMedia = PrismaWork & { media: PrismaWorkMedia[] };
type VoteRecordWithUser = PrismaVoteRecord & { user: PrismaUser };
let dbEnsured = false;


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

function safeConfig(value: Prisma.JsonValue | null | undefined): ContestConfig {
  const config = {
    ...defaultConfig,
    ...((value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Partial<ContestConfig>)
  };
  if (config.notice === placeholderNotice) {
    config.notice = defaultNotice;
  }
  // Send explicit offsets so browser locale cannot change the displayed instant.
  for (const key of ['voteStart', 'voteEnd'] as const) {
    if (Number.isFinite(contestTimestamp(config[key]))) config[key] = normalizeContestTime(config[key]);
  }
  return config;
}

function safeMeta(value: Prisma.JsonValue | null | undefined): Work['meta'] {
  const meta = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Work['meta'];
  return {
    ...meta,
    category: normalizeWorkCategory(meta.category)
  };
}

function mapTheme(row: PrismaTheme): Theme {
  return {
    id: row.id as ThemeId,
    prefix: row.prefix,
    name: row.name,
    description: row.description,
    order: row.sortOrder
  };
}

function mapMedia(row: PrismaWorkMedia): WorkMedia {
  return {
    id: row.id,
    type: row.type as 'image' | 'video',
    url: row.url,
    poster: row.poster || undefined,
    title: row.title || undefined,
    order: row.sortOrder
  };
}

function mapWork(row: WorkWithMedia): Work {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    author: row.author,
    team: row.team || undefined,
    themeId: row.themeId as ThemeId,
    themeName: row.themeName,
    type: row.type as WorkType,
    cover: row.cover,
    description: row.description,
    status: row.status as WorkStatus,
    votes: row.votes,
    displayOrder: row.displayOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    meta: safeMeta(row.meta),
    media: row.media.map(mapMedia)
  };
}

function mapVote(row: VoteRecordWithUser): VoteRecord {
  return {
    id: row.id,
    userId: row.userId,
    phone: row.user.phone || row.user.email || '',
    workId: row.workId,
    themeId: row.themeId as ThemeId,
    createdAt: row.createdTime.toISOString(),
    day: row.voteDate
  };
}

function mapVisit(row: PrismaVisit): VisitRecord {
  return {
    id: row.id,
    visitorId: row.visitorId,
    phone: row.phone || undefined,
    path: row.path,
    createdAt: row.createdAt.toISOString(),
    day: row.day
  };
}

function mapReport(row: PrismaReport): ReportRecord {
  return {
    id: row.id,
    workId: row.workId,
    reason: row.reason,
    description: row.description || undefined,
    contact: row.contact || undefined,
    phone: row.phone || undefined,
    visitorId: row.visitorId,
    status: row.status as ReportStatus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function workCreateInput(work: Work) {
  return {
    id: work.id,
    code: work.code,
    title: work.title,
    author: work.author,
    team: work.team || null,
    themeId: work.themeId,
    themeName: work.themeName,
    type: work.type,
    cover: work.cover,
    description: work.description,
    status: work.status,
    votes: work.votes,
    displayOrder: work.displayOrder,
    createdAt: new Date(work.createdAt),
    updatedAt: new Date(work.updatedAt),
    meta: work.meta as Prisma.InputJsonValue
  };
}

async function replaceAll(data: Database, client: typeof prisma = prisma) {
  await client.$transaction(async (tx) => {
    await tx.workMedia.deleteMany();
    await tx.voteRecord.deleteMany();
    await tx.vote.deleteMany();
    await tx.visit.deleteMany();
    await tx.report.deleteMany();
    await tx.user.deleteMany();
    await tx.work.deleteMany();
    await tx.theme.deleteMany();
    await tx.appConfig.deleteMany();

    await tx.appConfig.create({
      data: {
        key: 'config',
        value: data.config as unknown as Prisma.InputJsonValue
      }
    });

    if (data.themes.length) {
      await tx.theme.createMany({
        data: data.themes.map((theme) => ({
          id: theme.id,
          prefix: theme.prefix,
          name: theme.name,
          description: theme.description,
          sortOrder: theme.order
        }))
      });
    }

    if (data.works.length) {
      await tx.work.createMany({
        data: data.works.map(workCreateInput)
      });
      const media = data.works.flatMap((work) =>
        work.media.map((item) => ({
          id: item.id,
          workId: work.id,
          type: item.type,
          url: item.url,
          poster: item.poster || null,
          title: item.title || null,
          sortOrder: item.order
        }))
      );
      if (media.length) await tx.workMedia.createMany({ data: media });
    }

    if (data.votes.length) {
      const usersByPhone = new Map<
        string,
        {
          id: string;
          phone: string;
          createdTime: Date;
          lastLoginTime: Date;
        }
      >();

      for (const vote of data.votes) {
        const createdTime = new Date(vote.createdAt);
        const existing = usersByPhone.get(vote.phone);
        if (!existing) {
          usersByPhone.set(vote.phone, {
            id: vote.userId || `user_${crypto.createHash('md5').update(vote.phone).digest('hex')}`,
            phone: vote.phone,
            createdTime,
            lastLoginTime: createdTime
          });
        } else {
          if (createdTime < existing.createdTime) existing.createdTime = createdTime;
          if (createdTime > existing.lastLoginTime) existing.lastLoginTime = createdTime;
        }
      }

      await tx.user.createMany({
        data: [...usersByPhone.values()].map((user) => ({
          ...user,
          token: null,
          tokenExpireTime: null
        }))
      });

      await tx.vote.createMany({
        data: data.votes.map((vote) => ({
          id: vote.id,
          phone: vote.phone,
          workId: vote.workId,
          themeId: vote.themeId,
          createdAt: new Date(vote.createdAt),
          day: vote.day
        }))
      });

      await tx.voteRecord.createMany({
        data: data.votes.map((vote) => ({
          id: vote.id,
          userId: usersByPhone.get(vote.phone)!.id,
          workId: vote.workId,
          themeId: vote.themeId,
          voteDate: vote.day,
          createdTime: new Date(vote.createdAt)
        }))
      });
    }

    if (data.visits.length) {
      await tx.visit.createMany({
        data: data.visits.map((visit) => ({
          id: visit.id,
          visitorId: visit.visitorId,
          phone: visit.phone || null,
          path: visit.path,
          createdAt: new Date(visit.createdAt),
          day: visit.day
        }))
      });
    }

    if (data.reports.length) {
      await tx.report.createMany({
        data: data.reports.map((report) => ({
          id: report.id,
          workId: report.workId,
          reason: report.reason,
          description: report.description || null,
          contact: report.contact || null,
          phone: report.phone || null,
          visitorId: report.visitorId,
          status: report.status,
          createdAt: new Date(report.createdAt),
          updatedAt: new Date(report.updatedAt)
        }))
      });
    }
  });
}

export async function ensureDb() {
  if (dbEnsured) return;
  // Startup only fills missing configuration; never seeds works or rewrites source codes.
  await prisma.appConfig.upsert({
    where: { key: "config" },
    create: { key: "config", value: defaultConfig as unknown as Prisma.InputJsonValue },
    update: {}
  });
  for (const theme of themes) {
    await prisma.theme.upsert({
      where: { id: theme.id },
      create: { id: theme.id, prefix: theme.prefix, name: theme.name, description: theme.description, sortOrder: theme.order },
      update: {}
    });
  }
  dbEnsured = true;
}

export async function readDb(): Promise<Database> {
  await ensureDb();
  const [configRow, themeRows, workRows, voteRows, visitRows, reportRows] = await prisma.$transaction([
    prisma.appConfig.findUnique({ where: { key: 'config' } }),
    prisma.theme.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.work.findMany({ include: { media: { orderBy: { sortOrder: 'asc' } } }, orderBy: { displayOrder: 'asc' } }),
    prisma.voteRecord.findMany({ include: { user: true }, orderBy: { createdTime: 'asc' } }),
    prisma.visit.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.report.findMany({ orderBy: { createdAt: 'desc' } })
  ]);

  return {
    config: safeConfig(configRow?.value),
    themes: themeRows.map(mapTheme),
    works: workRows.map(mapWork),
    votes: voteRows.map(mapVote),
    visits: visitRows.map(mapVisit),
    reports: reportRows.map(mapReport)
  };
}

export async function writeDb(dbData: Database) {
  await replaceAll(dbData);
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

export function rankingFor(db: Database) {
  const works = publicWorks(db)
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

async function configuredTokenExpiresAt(tx: Pick<typeof prisma, 'appConfig'> | typeof prisma = prisma) {
  const configRow = await tx.appConfig.findUnique({ where: { key: 'config' } });
  return tokenExpiresAt(safeConfig(configRow?.value));
}

function sessionPayload(user: PrismaUser, token: string): UserSession {
  if (!user.tokenExpireTime) throw new Error('登录状态已失效，请重新验证手机号');
  return {
    userId: user.id,
    phone: user.phone || '',
    token,
    expiresAt: user.tokenExpireTime.toISOString()
  };
}

export async function createUserSession(phone: string): Promise<UserSession> {
  const normalizedPhone = phone.trim();
  if (!/^1\d{10}$/.test(normalizedPhone)) {
    throw new Error('请输入正确的手机号');
  }

  const now = new Date();
  const token = createSessionToken();
  const tokenDigest = tokenHash(token);
  const expiresAt = await configuredTokenExpiresAt();

  const user = await prisma.user.upsert({
    where: { phone: normalizedPhone },
    create: {
      id: id('user'),
      phone: normalizedPhone,
      token: tokenDigest,
      tokenExpireTime: expiresAt,
      createdTime: now,
      lastLoginTime: now
    },
    update: {
      token: tokenDigest,
      tokenExpireTime: expiresAt,
      lastLoginTime: now
    }
  });

  return sessionPayload(user, token);
}

export async function findUserSessionByToken(token?: string): Promise<UserSession | undefined> {
  if (!token) return undefined;
  const tokenDigest = tokenHash(token);
  const user = await prisma.user.findUnique({ where: { token: tokenDigest } });
  if (!user?.tokenExpireTime || user.tokenExpireTime.getTime() <= Date.now()) {
    return undefined;
  }

  const refreshedExpiresAt = await configuredTokenExpiresAt();
  const shouldRefresh = user.tokenExpireTime < refreshedExpiresAt;
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      lastLoginTime: new Date(),
      ...(shouldRefresh ? { tokenExpireTime: refreshedExpiresAt } : {})
    }
  });

  return sessionPayload(updated, token);
}

export async function castVote(userId: string, workId: string, ip: string) {
  const ipHash = networkHash(ip);
  return prisma.$transaction(async (tx) => {
    await lockVoteEpoch(tx);
    await lockKeys(tx, ['vote:account:' + userId]);
    const now = new Date();
    const day = beijingDay(now);
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'active') throw forbidden('账号不可用，请重新登录');

    const configRow = await tx.appConfig.findUnique({ where: { key: 'config' } });
    const config = safeConfig(configRow?.value);
    const phase = getPhase(config);
    if (phase === 'pending') throw new Error('投票尚未开始');
    if (phase === 'ended') throw new Error('投票已结束');

    const work = await tx.work.findUnique({
      where: { id: workId },
      include: { media: { orderBy: { sortOrder: 'asc' } } }
    });
    if (!work || work.status !== 'published') {
      throw new Error('当前作品暂不可投票');
    }

    const allowance = await voteAllowance(tx, userId, ipHash, now);
    if (allowance.accountVotes >= 3) throw tooManyRequests('该账号24小时内的3票已用完，请稍后再来', 'VOTE_LIMIT');

    await tx.voteRecord.create({
      data: {
        id: id('vote'),
        userId,
        workId: work.id,
        themeId: work.themeId,
        voteDate: day,
        createdTime: now,
        ipHash
      }
    });

    const updated = await tx.work.update({
      where: { id: work.id },
      data: {
        votes: { increment: 1 },
        updatedAt: new Date()
      },
      include: { media: { orderBy: { sortOrder: 'asc' } } }
    });

    const [publishedWorks, totalViews] = await Promise.all([
      tx.work.findMany({ where: { status: 'published' }, select: { votes: true } }),
      tx.visit.count()
    ]);

    return {
      work: mapWork(updated),
      stats: {
        totalVotes: publishedWorks.reduce((sum, item) => sum + item.votes, 0),
        workCount: publishedWorks.length,
        candidateCount: publishedWorks.length,
        totalViews
      }
    };
  });
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

export async function recordVisit(visitorId: string, pathName: string, phone?: string) {
  const now = new Date();
  const recentSince = new Date(now.getTime() - visitDedupeWindowMs);
  const duplicate = await prisma.visit.findFirst({
    where: {
      path: pathName,
      createdAt: { gte: recentSince },
      ...(phone ? { phone } : { visitorId, phone: null })
    }
  });

  if (duplicate) return false;

  await prisma.visit.create({
    data: {
      id: id('visit'),
      visitorId,
      phone: phone || null,
      path: pathName,
      createdAt: now,
      day: beijingDay(now)
    }
  });
  return true;
}

const reportDedupeWindowMs = 10 * 60 * 1000;

function reportIdentity(report: Pick<ReportRecord, 'phone' | 'visitorId'>) {
  return report.phone ? `phone:${report.phone}` : `visitor:${report.visitorId}`;
}

export async function createReport(input: {
  workId: string;
  reason: string;
  description?: string;
  contact?: string;
  phone?: string;
  visitorId: string;
}) {
  const now = new Date();
  const reason = input.reason.trim();
  const description = input.description?.trim();
  const contact = input.contact?.trim();

  if (!reason) {
    throw new Error('请选择举报原因');
  }

  const work = await prisma.work.findUnique({ where: { id: input.workId } });
  if (!work || work.status !== 'published') {
    throw new Error('当前作品暂不可举报');
  }

  const recentSince = new Date(now.getTime() - reportDedupeWindowMs);
  const duplicate = await prisma.report.findFirst({
    where: {
      workId: work.id,
      createdAt: { gte: recentSince },
      ...(input.phone ? { phone: input.phone } : { visitorId: input.visitorId, phone: null })
    }
  });

  if (duplicate) {
    throw new Error('举报提交太频繁，请稍后再试');
  }

  const report = await prisma.report.create({
    data: {
      id: id('report'),
      workId: work.id,
      reason: reason.slice(0, 50),
      description: description ? description.slice(0, 500) : null,
      contact: contact ? contact.slice(0, 80) : null,
      phone: input.phone || null,
      visitorId: input.visitorId,
      status: 'pending',
      createdAt: now,
      updatedAt: now
    }
  });

  return mapReport(report);
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
  const themeId = (input.themeId || existing?.themeId || db.themes[0]?.id || 'A') as ThemeId;
  const theme = db.themes.find((item) => item.id === themeId);
  if (!theme) throw new Error('请选择正确的作品主题');
  const now = nowIso();
  const usedCodes = new Set(db.works.filter((work) => work.id !== existing?.id).map((work) => work.code));
  const nextCode = Array.from({ length: 25 }, (_, index) => String(index + 1).padStart(2, '0')).find((item) => !usedCodes.has(item));
  const code = input.code || existing?.code || nextCode || '25';
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

export async function saveAdminConfig(input: { config: ContestConfig; themes: Theme[] }) {
  const voteStart = new Date(contestTimestamp(input.config.voteStart));
  const voteEnd = new Date(contestTimestamp(input.config.voteEnd));
  if (Number.isNaN(voteStart.getTime()) || (input.config.voteEnd && (Number.isNaN(voteEnd.getTime()) || voteEnd <= voteStart))) {
    throw new Error('投票开始和结束时间不正确');
  }
  const normalizedConfig = { ...input.config, voteStart: normalizeContestTime(input.config.voteStart), voteEnd: input.config.voteEnd ? normalizeContestTime(input.config.voteEnd) : '' };
  await prisma.$transaction(async (tx) => {
    await tx.appConfig.upsert({
      where: { key: 'config' },
      create: { key: 'config', value: normalizedConfig as unknown as Prisma.InputJsonValue },
      update: { value: normalizedConfig as unknown as Prisma.InputJsonValue }
    });

    for (const theme of input.themes) {
      await tx.theme.upsert({
        where: { id: theme.id },
        create: {
          id: theme.id,
          prefix: theme.prefix,
          name: theme.name,
          description: theme.description,
          sortOrder: theme.order
        },
        update: {
          prefix: theme.prefix,
          name: theme.name,
          description: theme.description,
          sortOrder: theme.order
        }
      });

      await tx.work.updateMany({
        where: { themeId: theme.id },
        data: { themeName: theme.name }
      });
    }
  });

  const db = await readDb();
  return { config: db.config, themes: db.themes };
}

export async function persistWork(work: Work) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('works:capacity'))");
    const [existing, workCount] = await Promise.all([
      tx.work.findFirst({ where: { OR: [{ id: work.id }, { code: work.code }] }, select: { id: true } }),
      tx.work.count()
    ]);
    if (!existing && workCount >= 25) {
      throw new Error('作品总数最多为25个，不能继续新增');
    }
    await tx.work.upsert({
      where: { id: work.id },
      create: workCreateInput(work),
      // Editing an old form must not restore pre-reset or overwrite new votes.
      update: { ...workCreateInput(work), votes: undefined }
    });
    await tx.workMedia.deleteMany({ where: { workId: work.id } });
    if (work.media.length) {
      await tx.workMedia.createMany({
        data: work.media.map((item) => ({
          id: item.id,
          workId: work.id,
          type: item.type,
          url: item.url,
          poster: item.poster || null,
          title: item.title || null,
          sortOrder: item.order
        }))
      });
    }
  });

  const saved = await prisma.work.findUniqueOrThrow({
    where: { id: work.id },
    include: { media: { orderBy: { sortOrder: 'asc' } } }
  });
  return mapWork(saved);
}

export async function setWorkStatus(idValue: string, status: WorkStatus) {
  const work = await prisma.work.update({
    where: { id: idValue },
    data: {
      status,
      updatedAt: new Date()
    },
    include: { media: { orderBy: { sortOrder: 'asc' } } }
  });
  return mapWork(work);
}

export async function batchUpdateWorks(input: {
  ids: string[];
  status?: WorkStatus;
  themeId?: ThemeId;
  category?: string;
}) {
  const ids = [...new Set(input.ids.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) return { count: 0, works: (await readDb()).works };

  const db = await readDb();
  const theme = input.themeId ? db.themes.find((item) => item.id === input.themeId) : undefined;
  if (input.themeId && !theme) throw new Error('请选择正确的作品主题');
  const normalizedCategory = input.category ? normalizeWorkCategory(input.category) : undefined;
  const targets = db.works.filter((work) => ids.includes(work.id));

  await prisma.$transaction(async (tx) => {
    for (const work of targets) {
      await tx.work.update({
        where: { id: work.id },
        data: {
          ...(input.status ? { status: input.status } : {}),
          ...(theme ? { themeId: theme.id, themeName: theme.name } : {}),
          ...(normalizedCategory ? { meta: { ...work.meta, category: normalizedCategory } as unknown as Prisma.InputJsonValue } : {}),
          updatedAt: new Date()
        }
      });
    }
  });

  const updatedDb = await readDb();
  return { count: targets.length, works: updatedDb.works };
}

export async function importAdminWorks(incoming: ImportRow[]) {
  const db = await readDb();
  const initialWorkCount = db.works.length;
  const normalized: Work[] = [];

  for (const [rowIndex, input] of incoming.entries()) {
    let work: Work;
    try {
      work = normalizeWork(normalizeImportedWorkInput(input, db), db);
    } catch (error) {
      throw new Error(`第${rowIndex + 2}行：${error instanceof Error ? error.message : '作品数据不正确'}`);
    }
    const index = db.works.findIndex((item) => item.id === work.id || item.code === work.code);
    if (index >= 0) {
      work.votes = db.works[index].votes;
      db.works[index] = work;
    } else {
      work.votes = 0;
      db.works.push(work);
    }
    normalized.push(work);
  }

  if (db.works.length > 25) {
    throw new Error(`作品总数最多为25个，当前已有${initialWorkCount}个，本次最多还能新增${Math.max(0, 25 - initialWorkCount)}个`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('works:capacity'))");
    const storedWorks = await tx.work.findMany({ select: { id: true, code: true } });
    const storedKeys = new Set(storedWorks.flatMap((work) => [work.id, work.code]));
    const newKeys = new Set(
      normalized
        .filter((work) => !storedKeys.has(work.id) && !storedKeys.has(work.code))
        .map((work) => work.code)
    );
    if (storedWorks.length + newKeys.size > 25) {
      throw new Error(`作品总数最多为25个，当前已有${storedWorks.length}个，本次最多还能新增${Math.max(0, 25 - storedWorks.length)}个`);
    }
    for (const work of normalized) {
      const existing = await tx.work.findFirst({
        where: { OR: [{ id: work.id }, { code: work.code }] }
      });
      const target = existing ? { ...work, id: existing.id, votes: existing.votes, createdAt: existing.createdAt.toISOString() } : work;
      await tx.work.upsert({
        where: { id: target.id },
        create: workCreateInput(target),
        update: { ...workCreateInput(target), votes: undefined }
      });
      await tx.workMedia.deleteMany({ where: { workId: target.id } });
      if (target.media.length) {
        await tx.workMedia.createMany({
          data: target.media.map((item) => ({
            id: item.id,
            workId: target.id,
            type: item.type,
            url: item.url,
            poster: item.poster || null,
            title: item.title || null,
            sortOrder: item.order
          }))
        });
      }
    }
  });

  const updatedDb = await readDb();
  return { count: normalized.length, works: updatedDb.works };
}

export async function setReportStatus(idValue: string, status: ReportStatus) {
  const report = await prisma.report.update({
    where: { id: idValue },
    data: {
      status,
      updatedAt: new Date()
    }
  });
  return mapReport(report);
}
