export type ThemeId = 'all' | 'A' | 'B' | 'C' | 'D';
export type WorkStatus = 'published' | 'offline';
export type WorkType = 'image' | 'video';
export type MediaType = 'image' | 'video';
export type ReportStatus = 'pending' | 'handled' | 'ignored';

export interface Theme {
  id: Exclude<ThemeId, 'all'>;
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
  type: MediaType;
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
  themeId: Exclude<ThemeId, 'all'>;
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

export interface PublicStats {
  totalVotes: number;
  workCount: number;
  totalViews: number;
  candidateCount: number;
}

export interface RankingItem {
  rank: number;
  work: Work;
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

export interface AdminReportRecord extends ReportRecord {
  work?: Work;
}

export interface AppBootstrap {
  config: ContestConfig;
  stats: PublicStats;
  serverTime: string;
  phase: 'pending' | 'active' | 'ended';
}

export interface AdminDashboard {
  phase: AppBootstrap['phase'];
  totalVotes: number;
  todayVotes: number;
  voteUsers: number;
  publishedWorks: number;
  offlineWorks: number;
  todayPV: number;
  totalPV: number;
  todayUV: number;
  totalUV: number;
  updatedAt: string;
}

export interface UserProfile {
  phone: string;
  email: string;
  maskedEmail: string;
  maskedIdentifier: string;
  accountType: string;
  networkVotes: number;
  maskedPhone: string;
  createdTime: string;
  lastLoginTime: string;
  totalVotes: number;
  todayVotes: number;
  todayRemaining: number;
}

export interface UserVoteRecord {
  id: string;
  voteDate: string;
  createdTime: string;
  work: { id: string; code: string; title: string };
}

export interface AdminUserRecord {
  id: string;
  phone: string;
  email: string;
  identifier: string;
  status: 'active' | 'disabled';
  createdTime: string;
  lastLoginTime: string;
  voteCount: number;
  sessionCount: number;
}
