<template>
  <main class="admin-page">
    <div class="admin-wrap">
      <header class="admin-header">
        <div>
          <h1>{{ CONTEST_TITLE }}</h1>
          <p>单管理员账号 · 票数按真实投票统计，清零需二次确认</p>
        </div>
        <div class="header-actions">
          <button class="btn-secondary" @click="$router.push('/vote')">查看H5</button>
          <button class="btn-primary" @click="logout">退出</button>
        </div>
      </header>

      <nav class="admin-tabs">
        <button v-for="tab in tabs" :key="tab.key" :class="{ active: activeTab === tab.key }" @click="activeTab = tab.key">
          {{ tab.label }}
        </button>
      </nav>

      <section v-if="activeTab === 'overview'" class="admin-section">
        <div class="admin-grid">
          <article v-for="card in dashboardCards" :key="card.label" class="admin-card metric">
            <span>{{ card.label }}</span>
            <strong>{{ card.value }}</strong>
          </article>
        </div>
      </section>

      <section v-if="activeTab === 'config' && configForm" class="admin-section">
        <div class="admin-card form-card">
          <h2>大赛信息管理</h2>
          <div class="form-grid">
            <label class="field">大赛全称<input v-model="configForm.config.title" /></label>
            <label class="field">页面展示名称<input v-model="configForm.config.shortTitle" /></label>
            <label class="field">主题口号<input v-model="configForm.config.slogan" /></label>
            <label class="field">顶部副标题<input v-model="configForm.config.introSubtitle" /></label>
            <!-- Independent H5: retain its native input pattern, with explicit Beijing wall time. -->
            <label class="field">投票开始（北京时间）<input v-model="voteStartInput" type="datetime-local" step="0.001" /></label>
            <label class="field">投票结束（北京时间，留空表示未定）<input v-model="voteEndInput" type="datetime-local" step="0.001" /></label>
          </div>
          <p>开始和结束均按北京时间。结束日期的 00:00 表示在前一天结束后立即停止投票。</p>
          <label class="field">大赛介绍正文<textarea v-model="configForm.config.introDescription"></textarea></label>
          <label class="field">组织机构文字<textarea v-model="organizerText"></textarea></label>
          <label class="field">投票规则<textarea v-model="configForm.config.rules"></textarea></label>
          <label class="field">比赛通知全文<textarea v-model="configForm.config.notice"></textarea></label>
          <label class="field">保留说明<textarea v-model="configForm.config.retentionNote"></textarea></label>

          <button class="btn-primary" :disabled="savingConfig" @click="saveConfig">{{ savingConfig ? '正在保存…' : '保存配置' }}</button>
          <p v-if="configSaveStatus" role="status">{{ configSaveStatus }}</p>
        </div>
      </section>

      <section v-if="activeTab === 'works'" class="admin-section">
        <div class="admin-card form-card">
          <h2>作品录入 / 导入</h2>
          <div class="form-grid">
            <label class="field">作品序号<input v-model="workForm.code" placeholder="01" /></label>
            <label class="field">作品名称<input v-model="workForm.title" /></label>
            <label class="field">作者/团队<input v-model="workForm.author" /></label>
            <label class="field">作品主题
              <select v-model="workForm.themeId">
                <option v-for="theme in configForm?.themes || []" :key="theme.id" :value="theme.id">{{ theme.name }}</option>
              </select>
            </label>
            <label class="field">作品类别
              <select v-model="workMeta.category">
                <option v-for="category in workCategoryOptions" :key="category" :value="category">{{ category }}类</option>
              </select>
            </label>
            <label class="field">首张海报路径（A3竖版）<input v-model="workForm.cover" placeholder="请上传作品海报或填写图片地址" /></label>
            <label class="field">展示顺序<input v-model.number="workForm.displayOrder" type="number" /></label>
          </div>
          <div class="cover-upload-row">
            <label class="field cover-file-field">
              上传作品首张海报（A3竖版）
              <input type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,image/tiff" :disabled="uploadingCover" @change="uploadCover" />
            </label>
            <div class="cover-preview" aria-label="首张海报预览">
              <img v-if="workForm.cover" :src="workForm.cover" alt="作品首张海报预览" />
              <span v-else>暂无海报</span>
            </div>
            <p class="subtle">系统会自动校正方向、裁剪为 A3 竖版，并转换为 1200×1697 的 WebP 图片。</p>
          </div>
          <label class="field">作品说明<textarea v-model="workForm.description"></textarea></label>
          <button class="btn-primary" :disabled="uploadingCover" @click="saveWork">{{ uploadingCover ? '海报处理中…' : '保存作品' }}</button>
        </div>

        <div class="admin-card form-card">
          <h2>批量导入</h2>
          <p class="subtle">支持上传飞书导出的 Excel/CSV 文件，也可上传由 Lark CLI 导出的 JSON 文件。作品名称、作者/团队、作品主题和作品类别为必填项；“作品首张海报（A3竖版）”会自动裁剪为 A3 竖版并转换为 WebP，其他图片附件保持原比例压缩。主题支持完整名称或 A/B/C/D，系统作品总数最多为25件。</p>
          <div class="import-file-row">
            <input ref="importFileInput" type="file" accept=".xlsx,.xls,.csv,.json" />
            <button class="btn-secondary" :disabled="importingFile" @click="importWorksFile">{{ importingFile ? '导入中…' : '上传文件导入' }}</button>
          </div>
        </div>

        <div class="admin-card table-card">
          <h2>作品列表</h2>
          <div class="batch-bar">
            <label class="batch-check">
              <input type="checkbox" :checked="allWorksSelected" @change="toggleAllWorks" />
              <span>全选当前列表</span>
            </label>
            <strong>已选 {{ selectedWorkIds.length }} 件</strong>
            <button class="btn-secondary" :disabled="!selectedWorkIds.length" @click="batchSetStatus('published')">批量发布</button>
            <button class="btn-secondary" :disabled="!selectedWorkIds.length" @click="batchSetStatus('offline')">批量下架</button>
            <select v-model="batchThemeId" :disabled="!selectedWorkIds.length">
              <option value="">选择主题</option>
              <option v-for="theme in configForm?.themes || []" :key="theme.id" :value="theme.id">{{ theme.name }}</option>
            </select>
            <button class="btn-secondary" :disabled="!selectedWorkIds.length || !batchThemeId" @click="batchSetTheme">批量设置主题</button>
            <select v-model="batchCategory" :disabled="!selectedWorkIds.length">
              <option value="">选择类别</option>
              <option v-for="category in workCategoryOptions" :key="category" :value="category">{{ category }}类</option>
            </select>
            <button class="btn-secondary" :disabled="!selectedWorkIds.length || !batchCategory" @click="batchSetCategory">批量设置类别</button>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>选择</th><th>序号</th><th>名称</th><th>作者</th><th>主题</th><th>类别</th><th>票数</th><th>状态</th><th>操作</th></tr>
              </thead>
              <tbody>
                <tr v-for="work in works" :key="work.id">
                  <td><input v-model="selectedWorkIds" type="checkbox" :value="work.id" /></td>
                  <td>{{ work.code }}</td>
                  <td>{{ work.title }}</td>
                  <td>{{ work.author }}</td>
                  <td>{{ work.themeName }}</td>
                  <td>{{ formatWorkCategory(work) }}</td>
                  <td>{{ work.votes }}</td>
                  <td>{{ work.status === 'published' ? '已发布' : '已下架' }}</td>
                  <td>
                    <button class="link-btn" @click="editWork(work)">编辑</button>
                    <button class="link-btn" @click="toggleStatus(work)">{{ work.status === 'published' ? '下架' : '发布' }}</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section v-if="activeTab === 'rankings'" class="admin-section">
        <div class="admin-card table-card">
          <h2>排名统计</h2>
          <div class="table-wrap">
            <table>
              <thead><tr><th>排名</th><th>序号</th><th>作品</th><th>作者</th><th>票数</th></tr></thead>
              <tbody>
                <tr v-for="item in rankings" :key="item.work.id">
                  <td>{{ item.rank }}</td>
                  <td>{{ item.work.code }}</td>
                  <td>{{ item.work.title }}</td>
                  <td>{{ item.work.author }}</td>
                  <td>{{ item.work.votes }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section v-if="activeTab === 'users'" class="admin-section">
        <div class="admin-card table-card">
          <div class="user-toolbar">
            <div>
              <h2>用户管理</h2>
              <p class="subtle">查看邮箱或手机号账号、登录设备和投票情况，可停用或恢复异常账号。</p>
            </div>
            <div class="user-search">
              <input v-model.trim="userSearch" placeholder="输入手机号或邮箱搜索" @keyup.enter="loadUsers" />
              <button class="btn-secondary" @click="loadUsers">搜索</button>
            </div>
          </div>

          <div class="table-wrap">
            <table>
              <thead><tr><th>账号</th><th>注册时间</th><th>最近登录</th><th>累计投票</th><th>登录设备</th><th>账号状态</th><th>操作</th></tr></thead>
              <tbody>
                <tr v-for="user in adminUsers" :key="user.id">
                  <td>{{ user.identifier || user.phone }}</td>
                  <td>{{ format(user.createdTime) }}</td>
                  <td>{{ format(user.lastLoginTime) }}</td>
                  <td>{{ user.voteCount }}</td>
                  <td>{{ user.sessionCount }}</td>
                  <td>{{ user.status === 'active' ? '正常' : '已停用' }}</td>
                  <td>
                    <button class="link-btn" @click="toggleUserStatus(user)">{{ user.status === 'active' ? '停用' : '恢复' }}</button>
                  </td>
                </tr>
                <tr v-if="!adminUsers.length"><td colspan="7">暂无匹配用户</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section v-if="activeTab === 'votes'" class="admin-section">
        <div class="admin-card">
          <h2>票数管理</h2>
          <p>清零全部作品票数，并重置用户投票统计和可投额度。原投票记录会归档，账号、作品和浏览量保留。</p>
          <button type="button" class="btn-primary" @click="showVoteReset = true">清零全部票数</button>
          <p v-if="voteResetStatus" role="status">{{ voteResetStatus }}</p>
        </div>
        <div class="admin-card table-card">
          <h2>投票记录</h2>
          <div class="table-wrap">
            <table>
              <thead><tr><th>时间</th><th>账号</th><th>作品</th></tr></thead>
              <tbody>
                <tr v-for="record in voteRecords" :key="record.id">
                  <td>{{ format(record.createdAt) }}</td>
                  <td>{{ record.phone }}</td>
                  <td>{{ record.work?.code }} {{ record.work?.title }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section v-if="activeTab === 'visits'" class="admin-section">
        <div class="admin-card table-card">
          <h2>访问统计</h2>
          <div class="table-wrap">
            <table>
              <thead><tr><th>日期</th><th>PV</th><th>UV</th></tr></thead>
              <tbody>
                <tr v-for="row in visitRows" :key="row.day">
                  <td>{{ row.day }}</td>
                  <td>{{ row.pv }}</td>
                  <td>{{ row.uv }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section v-if="activeTab === 'reports'" class="admin-section">
        <div class="admin-card table-card">
          <h2>举报管理</h2>
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>时间</th><th>作品</th><th>原因</th><th>说明</th><th>联系方式</th><th>状态</th><th>操作</th></tr>
              </thead>
              <tbody>
                <tr v-for="record in reportRecords" :key="record.id">
                  <td>{{ format(record.createdAt) }}</td>
                  <td>{{ record.work?.code }} {{ record.work?.title }}</td>
                  <td>{{ record.reason }}</td>
                  <td>{{ record.description || '-' }}</td>
                  <td>{{ record.contact || record.phone || '-' }}</td>
                  <td>{{ reportStatusText(record.status) }}</td>
                  <td>
                    <button class="link-btn" @click="setReportStatus(record.id, 'pending')">待处理</button>
                    <button class="link-btn" @click="setReportStatus(record.id, 'handled')">已处理</button>
                    <button class="link-btn" @click="setReportStatus(record.id, 'ignored')">忽略</button>
                  </td>
                </tr>
                <tr v-if="!reportRecords.length">
                  <td colspan="7">暂无举报记录</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section v-if="activeTab === 'export'" class="admin-section">
        <div class="admin-card form-card">
          <h2>Excel 导出</h2>
          <p class="subtle">一次性导出综合 Excel，包含全部作品排名、各主题作品排名、每日投票统计、访问统计和举报记录。导出不改变任何票数。</p>
          <button class="btn-primary" @click="exportExcel">导出综合Excel</button>
        </div>
      </section>
    </div>
  </main>
  <VoteResetDialog v-if="showVoteReset" @close="showVoteReset = false" @completed="onVotesReset" />
</template>

<script setup lang="ts">
import { CONTEST_TITLE } from '../contest';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import VoteResetDialog from '../components/VoteResetDialog.vue';
import { beijingInput, normalizeContestTime } from '../../server/contestTime';
import type { AdminDashboard, AdminReportRecord, AdminUserRecord, AppBootstrap, RankingItem, ReportStatus, Theme, ThemeId, Work } from '../types';

const router = useRouter();
const tabs = [
  { key: 'overview', label: '数据概览' },
  { key: 'config', label: '大赛信息' },
  { key: 'works', label: '作品管理' },
  { key: 'rankings', label: '排名统计' },
  { key: 'users', label: '用户管理' },
  { key: 'votes', label: '投票数据' },
  { key: 'visits', label: '访问统计' },
  { key: 'reports', label: '举报管理' },
  { key: 'export', label: 'Excel导出' }
] as const;

const activeTab = ref<(typeof tabs)[number]['key']>('overview');
const dashboard = ref<AdminDashboard>();
const configForm = ref<{ config: AppBootstrap['config']; themes: Theme[] }>();
const organizerText = ref('');
const savingConfig = ref(false), configSaveStatus = ref('');
const voteStartInput = computed({
  get: () => beijingInput(configForm.value?.config.voteStart || ''),
  set: (value: string) => { if (configForm.value) configForm.value.config.voteStart = value ? normalizeContestTime(value) : ''; }
});
const voteEndInput = computed({
  get: () => beijingInput(configForm.value?.config.voteEnd || ''),
  set: (value: string) => { if (configForm.value) configForm.value.config.voteEnd = value ? normalizeContestTime(value) : ''; }
});
const works = ref<Work[]>([]);
const importFileInput = ref<HTMLInputElement>();
const importingFile = ref(false);
const uploadingCover = ref(false);
const selectedWorkIds = ref<string[]>([]);
const batchThemeId = ref<Exclude<ThemeId, 'all'> | ''>('');
const batchCategory = ref('');
const rankings = ref<RankingItem[]>([]);
const voteRecords = ref<any[]>([]);
const showVoteReset = ref(false);
const voteResetStatus = ref('');
async function onVotesReset() {
  voteResetStatus.value = '清零已完成，原投票记录已归档。';
  // Do not refresh configuration or work drafts that may have unsaved edits.
  const results = await Promise.allSettled([loadDashboard(), loadWorks(), loadRankings(), loadVotes(), loadUsers()]);
  if (results.some((result) => result.status === 'rejected')) voteResetStatus.value += '部分统计未能刷新，请稍后重新打开后台查看。';
}
const visitRows = ref<any[]>([]);
const reportRecords = ref<AdminReportRecord[]>([]);
const adminUsers = ref<AdminUserRecord[]>([]);
const userSearch = ref('');
const workCategoryOptions = ['视觉设计', '实物设计', '数字设计'];
const workForm = ref<Partial<Work>>({
  code: '',
  title: '',
  author: '',
  themeId: 'A',
  cover: '',
  description: '',
  displayOrder: 1,
  status: 'published',
  type: 'image',
  meta: {
    category: '视觉设计'
  }
});

const workMeta = computed({
  get() {
    workForm.value.meta ||= {};
    return workForm.value.meta;
  },
  set(value: Work['meta']) {
    workForm.value.meta = value;
  }
});

const dashboardCards = computed(() => [
  { label: '活动状态', value: dashboard.value?.phase === 'active' ? '进行中' : dashboard.value?.phase === 'pending' ? '未开始' : '已结束' },
  { label: '总票数', value: dashboard.value?.totalVotes ?? 0 },
  { label: '今日票数', value: dashboard.value?.todayVotes ?? 0 },
  { label: '投票用户数', value: dashboard.value?.voteUsers ?? 0 },
  { label: '已发布作品', value: dashboard.value?.publishedWorks ?? 0 },
  { label: '已下架作品', value: dashboard.value?.offlineWorks ?? 0 },
  { label: '累计PV', value: dashboard.value?.totalPV ?? 0 },
  { label: '累计UV', value: dashboard.value?.totalUV ?? 0 }
]);

const allWorksSelected = computed(() => works.value.length > 0 && works.value.every((work) => selectedWorkIds.value.includes(work.id)));

function requireLogin() {
  return true;
}

function format(value: string) {
  return new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
}

async function loadDashboard() {
  dashboard.value = await api.getAdminDashboard();
}

async function loadConfig() {
  configForm.value = await api.getAdminConfig();
  organizerText.value = configForm.value.config.organizerText.join('\n');
}

async function loadWorks() {
  works.value = (await api.getAdminWorks()).works;
  const currentIds = new Set(works.value.map((work) => work.id));
  selectedWorkIds.value = selectedWorkIds.value.filter((id) => currentIds.has(id));
}

async function loadRankings() {
  rankings.value = (await api.getRankings()).rankings;
}

async function loadVotes() {
  voteRecords.value = (await api.getVoteRecords()).records;
}

async function loadVisits() {
  visitRows.value = (await api.getVisitStats()).daily;
}

async function loadReports() {
  reportRecords.value = (await api.getReports()).records;
}

async function loadUsers() {
  adminUsers.value = (await api.getAdminUsers(userSearch.value)).users;
}

async function refresh() {
  await Promise.all([loadDashboard(), loadConfig(), loadWorks(), loadRankings(), loadVotes(), loadVisits(), loadReports(), loadUsers()]);
}

async function toggleUserStatus(user: AdminUserRecord) {
  const status = user.status === 'active' ? 'disabled' : 'active';
  if (!confirm(`确认${status === 'active' ? '恢复' : '停用'}账号 ${user.identifier || user.phone}？`)) return;
  await api.setAdminUserStatus(user.id, status);
  await loadUsers();
}

async function saveConfig() {
  if (!configForm.value || savingConfig.value) return;
  savingConfig.value = true; configSaveStatus.value = '';
  try {
    configForm.value.config.organizerText = organizerText.value.split(/\n+/).map((item) => item.trim()).filter(Boolean);
    await api.saveAdminConfig(configForm.value);
    configSaveStatus.value = '配置已保存，投票时间按北京时间生效。';
    await loadDashboard().catch(() => undefined);
  } catch (error) { configSaveStatus.value = error instanceof Error ? error.message : '保存失败，请稍后重试'; }
  finally { savingConfig.value = false; }
}

function editWork(work: Work) {
  workForm.value = JSON.parse(JSON.stringify(work));
  workForm.value.meta ||= {};
  if (!workCategoryOptions.includes(workForm.value.meta.category || '')) {
    workForm.value.meta.category = '视觉设计';
  }
  activeTab.value = 'works';
}

async function saveWork() {
  workForm.value.meta ||= {};
  if (!workCategoryOptions.includes(workForm.value.meta.category || '')) {
    workForm.value.meta.category = '视觉设计';
  }
  syncCoverMedia(workForm.value.cover || '');
  await api.saveWork(workForm.value);
  alert('作品已保存');
  workForm.value = {
    code: '',
    title: '',
    author: '',
    themeId: 'A',
    cover: '',
    description: '',
    displayOrder: works.value.length + 1,
    status: 'published',
    type: 'image',
    meta: {
      category: '视觉设计'
    }
  };
  await refresh();
}

function syncCoverMedia(url: string) {
  if (!url) return;
  const media = (workForm.value.media || []).slice().sort((a, b) => a.order - b.order);
  if (media[0]?.type === 'image') {
    media[0] = { ...media[0], url, poster: url, title: '作品首张海报（A3竖版）' };
  } else {
    media.unshift({
      id: `media_${workForm.value.id || workForm.value.code || 'new'}_cover_${Date.now()}`,
      type: 'image',
      url,
      poster: url,
      title: '作品首张海报（A3竖版）',
      order: 1
    });
  }
  workForm.value.media = media.map((item, index) => ({
    ...item,
    order: index + 1,
    ...(item.type === 'video' && !item.poster ? { poster: url } : {})
  }));
}

async function uploadCover(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  uploadingCover.value = true;
  try {
    const result = await api.uploadAdminFile(file, 'cover');
    workForm.value.cover = result.url;
    syncCoverMedia(result.url);
  } catch (error) {
    alert(error instanceof Error ? error.message : '首张海报上传失败');
  } finally {
    uploadingCover.value = false;
    input.value = '';
  }
}

function formatWorkCategory(work: Work) {
  const category = work.meta.category?.trim();
  if (!category) return '未填写';
  return category.endsWith('类') ? category : `${category}类`;
}

async function toggleStatus(work: Work) {
  const status = work.status === 'published' ? 'offline' : 'published';
  if (status === 'offline' && !confirm('确认下架该作品？历史投票数据会保留。')) return;
  await api.setWorkStatus(work.id, status);
  await refresh();
}

function toggleAllWorks(event: Event) {
  const checked = (event.target as HTMLInputElement).checked;
  selectedWorkIds.value = checked ? works.value.map((work) => work.id) : [];
}

async function runBatchUpdate(payload: { status?: Work['status']; themeId?: Exclude<ThemeId, 'all'>; category?: string }, message: string) {
  if (!selectedWorkIds.value.length) {
    alert('请先选择作品');
    return;
  }
  if (!confirm(`${message}？已选 ${selectedWorkIds.value.length} 件作品。`)) return;
  const result = await api.batchUpdateWorks({ ids: selectedWorkIds.value, ...payload });
  alert(`已处理 ${result.count} 件作品`);
  selectedWorkIds.value = [];
  await refresh();
}

async function batchSetStatus(status: Work['status']) {
  await runBatchUpdate({ status }, status === 'published' ? '确认批量发布' : '确认批量下架');
}

async function batchSetTheme() {
  if (!batchThemeId.value) return;
  await runBatchUpdate({ themeId: batchThemeId.value }, '确认批量设置主题');
  batchThemeId.value = '';
}

async function batchSetCategory() {
  if (!batchCategory.value) return;
  await runBatchUpdate({ category: batchCategory.value }, '确认批量设置类别');
  batchCategory.value = '';
}

async function importWorksFile() {
  const file = importFileInput.value?.files?.[0];
  if (!file) {
    alert('请选择 Excel、CSV 或 JSON 文件');
    return;
  }
  importingFile.value = true;
  try {
    const result = await api.importWorksFile(file);
    alert(`已从 ${result.filename} 读取 ${result.rows} 行，导入 ${result.count} 件作品`);
    if (importFileInput.value) importFileInput.value.value = '';
    await refresh();
  } catch (error) {
    alert(error instanceof Error ? error.message : '文件导入失败');
  } finally {
    importingFile.value = false;
  }
}

function reportStatusText(status: ReportStatus) {
  if (status === 'handled') return '已处理';
  if (status === 'ignored') return '忽略';
  return '待处理';
}

async function setReportStatus(id: string, status: ReportStatus) {
  await api.setReportStatus(id, status);
  await loadReports();
}

async function exportExcel() {
  const response = await fetch('/api/admin/export.xlsx', { credentials: 'same-origin' });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    alert(payload.message || '导出失败');
    return;
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${CONTEST_TITLE}_${Date.now()}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}

async function logout() {
  await api.adminLogout().catch(() => undefined);
  await router.push('/admin/login');
}

onMounted(async () => {
  if (!requireLogin()) return;
  try {
    await refresh();
  } catch {
    await router.push('/admin/login');
  }
});
</script>

<style scoped>
.admin-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 18px;
}

h1,
h2,
h3,
p {
  margin: 0;
}

h1 {
  color: var(--blue);
}

.admin-header p {
  margin-top: 6px;
  color: var(--muted);
}

.header-actions {
  display: flex;
  gap: 10px;
}

.admin-tabs {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  margin-bottom: 18px;
  padding-bottom: 4px;
}

.admin-tabs button {
  flex: 0 0 auto;
  min-height: 38px;
  padding: 0 14px;
  border-radius: 999px;
  background: #fff;
  color: var(--muted);
  border: 1px solid rgba(137, 98, 48, 0.18);
}

.admin-tabs button.active {
  background: var(--red);
  color: #fff;
}

.admin-section {
  display: grid;
  gap: 16px;
}

.metric {
  padding: 18px;
}

.metric span {
  color: var(--muted);
  font-size: 13px;
}

.metric strong {
  display: block;
  margin-top: 8px;
  color: var(--red-dark);
  font-size: 26px;
}

.table-card,
.form-card {
  display: grid;
  gap: 14px;
  padding: 18px;
}

.link-btn {
  margin-right: 8px;
  background: transparent;
  color: var(--red);
  font-weight: 700;
}

.batch-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border: 1px solid rgba(137, 98, 48, 0.16);
  border-radius: 8px;
  background: rgba(255, 250, 241, 0.72);
}

.batch-check {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--blue);
  font-weight: 750;
}

.batch-bar strong {
  color: var(--red-dark);
}

.batch-bar select {
  min-height: 36px;
  min-width: 160px;
  border: 1px solid rgba(137, 98, 48, 0.18);
  border-radius: 8px;
  background: #fff;
}

.import-file-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.import-file-row input {
  min-height: 38px;
  max-width: 360px;
}

.cover-upload-row {
  display: grid;
  grid-template-columns: minmax(240px, 1fr) 150px;
  gap: 12px 18px;
  align-items: start;
  padding: 14px;
  border: 1px solid rgba(137, 98, 48, 0.16);
  border-radius: 8px;
  background: rgba(255, 250, 241, 0.72);
}

.cover-file-field input {
  min-height: 40px;
}

.cover-preview {
  grid-row: span 2;
  width: 150px;
  aspect-ratio: 297 / 420;
  overflow: hidden;
  display: grid;
  place-items: center;
  border: 1px solid rgba(137, 98, 48, 0.2);
  border-radius: 8px;
  background: #efe3cf;
  color: var(--muted);
  font-size: 13px;
}

.cover-preview img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.user-toolbar,
.user-search,
.temporary-password {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-toolbar,
.temporary-password {
  justify-content: space-between;
}

.user-search input {
  width: 220px;
  min-height: 38px;
  padding: 0 10px;
  border: 1px solid rgba(137, 98, 48, 0.2);
  border-radius: 8px;
}

button:disabled,
select:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

:deep(.category-tabs) {
  padding-left: 0;
  margin-top: 0;
}

@media (max-width: 760px) {
  .admin-header {
    grid-template-columns: 1fr;
    display: grid;
    align-items: start;
  }

  .header-actions {
    justify-content: start;
  }

  .user-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .user-search input {
    width: 100%;
  }

  .cover-upload-row {
    grid-template-columns: 1fr;
  }

  .cover-preview {
    grid-row: auto;
  }
}
</style>
