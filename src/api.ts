import type { AdminDashboard, AdminReportRecord, AdminUserRecord, AppBootstrap, ContestConfig, RankingItem, ReportStatus, Theme, UserProfile, UserVoteRecord, Work } from './types';

const API_BASE = '/api';
const phoneTokenKey = 'bj_vote_phone_token';
const phoneKey = 'bj_vote_phone';
const phoneTokenExpiresKey = 'bj_vote_phone_token_expires_at';

export interface PhoneSession {
  phone: string;
  email?: string;
  expiresAt: string;
}

export function savePhoneSession(session: PhoneSession) {
  localStorage.removeItem(phoneTokenKey);
  localStorage.setItem(phoneKey, session.phone);
  localStorage.setItem(phoneTokenExpiresKey, session.expiresAt);
}

export function clearPhoneSession() {
  localStorage.removeItem(phoneTokenKey);
  localStorage.removeItem(phoneKey);
  localStorage.removeItem(phoneTokenExpiresKey);
}

export async function restorePhoneSession() {
  try {
    const session = await api.getPhoneSession();
    savePhoneSession(session);
    return true;
  } catch {
    clearPhoneSession();
    return false;
  }
}

function getVisitorId() {
  const key = 'bj_vote_visitor_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

function publicHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-Visitor-Id': getVisitorId()
  };
}

function adminHeaders() {
  return {
    'Content-Type': 'application/json'
  };
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, { credentials: 'same-origin', ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || '请求失败，请稍后重试');
  }
  return payload as T;
}

export const api = {
  getAuthOptions() {
    return request<{ email: boolean; phone: boolean }>('/auth/options');
  },
  sendAuthCode(channel: 'email' | 'phone', purpose: 'register' | 'login', identifier: string) {
    const route = channel === 'email' ? `/auth/email/${purpose}/send` : `/auth/${purpose}/sms/send`;
    return request<{ message: string }>(route, { method: 'POST', headers: publicHeaders(), body: JSON.stringify({ [channel]: identifier }) });
  },
  verifyAuthCode(channel: 'email' | 'phone', purpose: 'register' | 'login', identifier: string, code: string) {
    const route = channel === 'email' ? `/auth/email/${purpose}` : `/auth/${purpose}`;
    return request<PhoneSession>(route, { method: 'POST', headers: publicHeaders(), body: JSON.stringify({ [channel]: identifier, code }) });
  },
  getBootstrap() {
    return request<AppBootstrap>('/config', { headers: publicHeaders() });
  },
  getWorks(params: { search?: string } = {}) {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    return request<{ works: Work[]; total: number }>(`/works?${query}`, { headers: publicHeaders() });
  },
  getWork(id: string) {
    return request<{ work: Work }>(`/works/${id}`, { headers: publicHeaders() });
  },
  sendRegistrationSms(phone: string) {
    return request<{ message: string; debugCode?: string }>('/auth/register/sms/send', {
      method: 'POST',
      headers: publicHeaders(),
      body: JSON.stringify({ phone })
    });
  },
  register(phone: string, code: string) {
    return request<PhoneSession>('/auth/register', {
      method: 'POST',
      headers: publicHeaders(),
      body: JSON.stringify({ phone, code })
    });
  },
  login(phone: string, code = '') {
    return request<PhoneSession>('/auth/login', {
      method: 'POST',
      headers: publicHeaders(),
      body: JSON.stringify({ phone, code })
    });
  },
  logout() {
    return request<{ ok: true }>('/auth/logout', { method: 'POST', headers: publicHeaders() });
  },
  getPhoneSession() {
    return request<PhoneSession>('/auth/session', { headers: publicHeaders() });
  },
  getMyProfile() {
    return request<{ profile: UserProfile }>('/me', { headers: publicHeaders() });
  },
  getMyVotes() {
    return request<{ records: UserVoteRecord[] }>('/me/votes', { headers: publicHeaders() });
  },
  vote(workId: string) {
    return request<{ message: string; work: Work; stats: AppBootstrap['stats']; session?: PhoneSession }>('/votes', {
      method: 'POST',
      headers: publicHeaders(),
      body: JSON.stringify({ workId })
    });
  },
  submitReport(payload: { workId: string; reason: string; description?: string; contact?: string }) {
    return request<{ message: string; report: { id: string; status: ReportStatus } }>('/reports', {
      method: 'POST',
      headers: publicHeaders(),
      body: JSON.stringify(payload)
    });
  },
  getRankings() {
    return request<{ rankings: RankingItem[]; updatedAt: string }>('/rankings', {
      headers: publicHeaders()
    });
  },
  recordVisit(path: string) {
    return request<{ ok: true; counted: boolean }>('/visits', {
      method: 'POST',
      headers: publicHeaders(),
      body: JSON.stringify({ path })
    }).catch(() => undefined);
  },
  adminLogin(username: string, password: string) {
    return request<{ username: string }>('/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
  },
  adminLogout() {
    return request<{ ok: true }>('/admin/logout', {
      method: 'POST',
      headers: adminHeaders()
    });
  },
  getAdminDashboard() {
    return request<AdminDashboard>('/admin/dashboard', { headers: adminHeaders() });
  },
  getAdminConfig() {
    return request<{ config: ContestConfig; themes: Theme[] }>('/admin/config', {
      headers: adminHeaders()
    });
  },
  saveAdminConfig(payload: { config: ContestConfig; themes: Theme[] }) {
    return request<{ config: ContestConfig; themes: Theme[] }>('/admin/config', {
      method: 'PUT',
      headers: adminHeaders(),
      body: JSON.stringify(payload)
    });
  },
  getAdminWorks() {
    return request<{ works: Work[] }>('/admin/works', { headers: adminHeaders() });
  },
  getAdminUsers(search = '') {
    const query = new URLSearchParams();
    if (search) query.set('search', search);
    return request<{ users: AdminUserRecord[] }>(`/admin/users?${query}`, { headers: adminHeaders() });
  },
  setAdminUserStatus(id: string, status: AdminUserRecord['status']) {
    return request<{ ok: true; status: AdminUserRecord['status'] }>(`/admin/users/${id}/status`, {
      method: 'PATCH',
      headers: adminHeaders(),
      body: JSON.stringify({ status })
    });
  },
  saveWork(work: Partial<Work>) {
    return request<{ work: Work }>('/admin/works', {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify(work)
    });
  },
  setWorkStatus(id: string, status: Work['status']) {
    return request<{ work: Work }>(`/admin/works/${id}/status`, {
      method: 'PATCH',
      headers: adminHeaders(),
      body: JSON.stringify({ status })
    });
  },
  batchUpdateWorks(payload: { ids: string[]; status?: Work['status']; themeId?: Exclude<Work['themeId'], 'all'>; category?: string }) {
    return request<{ count: number; works: Work[] }>('/admin/works/batch', {
      method: 'PATCH',
      headers: adminHeaders(),
      body: JSON.stringify(payload)
    });
  },
  async importWorksFile(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(`${API_BASE}/admin/works/import-file`, {
      method: 'POST',
      credentials: 'same-origin',
      body: formData
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.message || '文件导入失败');
    return payload as { count: number; rows: number; filename: string; works: Work[] };
  },
  async uploadAdminFile(file: File, purpose: 'cover' | 'media' = 'media') {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('purpose', purpose);
    const response = await fetch(`${API_BASE}/admin/upload`, {
      method: 'POST',
      credentials: 'same-origin',
      body: formData
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.message || '文件上传失败');
    return payload as { url: string; filename: string; originalName: string };
  },
  getVoteRecords() {
    return request<{ records: any[] }>('/admin/votes', { headers: adminHeaders() });
  },
  resetAllVotes(requestId: string, confirmation: string) {
    return request<{ receipt: { requestId: string; resetAt: string; workCount: number; previousVotes: number; archivedRecords: number } }>('/admin/votes/reset', {
      method: 'POST', headers: { ...adminHeaders(), 'X-Vote-Reset-Intent': 'confirmed' },
      body: JSON.stringify({ requestId, confirmation })
    });
  },
  getVisitStats() {
    return request<{ daily: any[] }>(`/admin/visits`, { headers: adminHeaders() });
  },
  getReports() {
    return request<{ records: AdminReportRecord[] }>('/admin/reports', { headers: adminHeaders() });
  },
  setReportStatus(id: string, status: ReportStatus) {
    return request<{ report: AdminReportRecord }>(`/admin/reports/${id}/status`, {
      method: 'PATCH',
      headers: adminHeaders(),
      body: JSON.stringify({ status })
    });
  }
};
