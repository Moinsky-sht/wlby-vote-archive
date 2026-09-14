<template>
  <main class="phone-shell">
    <div class="mobile-page">
      <section class="vote-hero">
        <img
          class="vote-hero-bg"
          :src="bannerImages[0].url + '?direct=1'"
          :srcset="bannerImages.map(image => image.url + '?direct=1 ' + image.width + 'w').join(', ')"
          sizes="(max-width: 520px) 100vw, 520px"
          :width="bannerImages[1].width" :height="bannerImages[1].height"
          :alt="CONTEST_TITLE"
          decoding="async"
          fetchpriority="high"
        />
        <h1 class="visually-hidden">{{ CONTEST_TITLE }}</h1>
      </section>
      <div class="vote-phase"><span class="status-pill">{{ phaseText }}</span></div>

      <section class="stats-scroll" v-if="bootstrap">
        <div class="stat-item">
          <span class="stat-value" :class="{ 'login-stat': !profile }">{{ profile ? profile.todayRemaining : '登录后查看' }}</span>
          <span class="stat-label">当日可投票数</span>
        </div>
        <div class="stat-item">
          <span class="stat-value" :class="{ 'login-stat': !profile }">{{ profile ? profile.totalVotes : '登录后查看' }}</span>
          <span class="stat-label">累计已投票数</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{{ bootstrap.stats.workCount }}</span>
          <span class="stat-label">作品数</span>
        </div>
      </section>
      <p class="personal-quota-note">可投票数按最近24小时计算，每个账号最多3票。</p>

      <section class="rule-strip" v-if="bootstrap">
        <Clock3 :size="18" />
        <span v-if="bootstrap.config.voteStart && bootstrap.config.voteEnd">投票时间：{{ formatDate(bootstrap.config.voteStart) }} 至 {{ formatDate(bootstrap.config.voteEnd) }}</span>
        <span v-else-if="bootstrap.config.voteStart">投票已开放，结束时间另行公布</span>
        <span v-else>投票时间待公布</span>
      </section>

      <div class="works-heading" v-if="bootstrap">
        <strong>全部作品</strong>
        <span>{{ bootstrap.stats.workCount }} 件</span>
      </div>

      <label class="search-box">
        <Search :size="18" color="#9b6d2f" />
        <input v-model.trim="search" placeholder="搜索序号、作品名称或作者" @keyup.enter="loadWorks()" />
        <button class="search-submit" type="button" @click="loadWorks()">搜索</button>
      </label>

      <section class="work-grid" v-if="works.length">
        <WorkCard
          v-for="work in works"
          :key="work.id"
          :work="work"
          :button-text="voteButtonText"
          :disabled="voteDisabled || votingId === work.id"
          @vote="handleVote"
          @detail="goDetail"
        />
      </section>

      <div v-else-if="!loading" class="empty-state">
        <p>{{ search ? '未找到相关作品' : '当前暂无作品' }}</p>
      </div>

      <div v-if="loading" class="empty-state">正在加载作品…</div>
    </div>

    <BottomNav active="vote" />
    <LoginModal v-model="showLogin" @success="retryVote" />
    <div v-if="toast" class="toast" role="status" aria-live="polite">{{ toast }}</div>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, onActivated, onDeactivated, nextTick, ref } from 'vue';
import { markListReady } from '../listNavigation';
import { CONTEST_TITLE } from '../contest';
import { useContestPhase } from '../useContestPhase';
import bannerImages from '../data/contest-banner.json';
defineOptions({name:'VotePage'});
import { useRouter } from 'vue-router';
import { Clock3, Search } from 'lucide-vue-next';
import { api, clearPhoneSession, restorePhoneSession, savePhoneSession } from '../api';
import type { AppBootstrap, Work, UserProfile } from '../types';
import BottomNav from '../components/BottomNav.vue';
import LoginModal from '../components/LoginModal.vue';
import WorkCard from '../components/WorkCard.vue';

const router = useRouter();
const bootstrap = ref<AppBootstrap>();
const phase = useContestPhase(bootstrap);
const profile = ref<UserProfile>();
const works = ref<Work[]>([]);
const search = ref('');
const loading = ref(false);
const toast = ref('');
const showLogin = ref(false);
const pendingWork = ref<Work>();
const votingId = ref('');
let initialized = false;
let worksRequest = 0;

const phaseText = computed(() => {
  if (!bootstrap.value) return '加载中';
  return phase.value === 'active' ? '投票进行中' : phase.value === 'pending' ? '投票尚未开始' : '投票已结束';
});

const voteButtonText = computed(() => {
  if (!bootstrap.value) return '投票';
  if (phase.value === 'pending') return '投票尚未开始';
  if (phase.value === 'ended') return '投票已结束';
  return '投票';
});

const voteDisabled = computed(() => phase.value !== 'active');

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间待确认';
  return date.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function showToast(message: string) {
  toast.value = message;
  window.setTimeout(() => {
    toast.value = '';
  }, 3500);
}

async function loadBootstrap() {
  bootstrap.value = await api.getBootstrap();
}
async function loadPersonalStats() {
  try { profile.value=(await restorePhoneSession()) ? (await api.getMyProfile()).profile : undefined; }
  catch {profile.value=undefined;}
}

async function loadWorks(silent = false) {
  const requestId = ++worksRequest;
  if (!silent) loading.value = true;
  try {
    const result = await api.getWorks({ search: search.value });
    if(requestId === worksRequest) works.value = result.works;
  } finally {
    if(requestId === worksRequest) loading.value = false;
  }
}

async function ensureVoteSession() {
  return restorePhoneSession();
}

async function handleVote(work: Work) {
  if (!(await ensureVoteSession())) {
    pendingWork.value = work;
    showLogin.value = true;
    return;
  }
  votingId.value = work.id;
  try {
    const result = await api.vote(work.id);
    if (result.session) savePhoneSession(result.session);
    showToast(result.message);
    bootstrap.value = bootstrap.value ? { ...bootstrap.value, stats: result.stats } : bootstrap.value;
    const index = works.value.findIndex((item) => item.id === work.id);
    if (index >= 0) works.value[index] = result.work;
    if(profile.value) profile.value={...profile.value,totalVotes:profile.value.totalVotes+1,todayVotes:profile.value.todayVotes+1,todayRemaining:Math.max(0,profile.value.todayRemaining-1)};
  } catch (error) {
    const message = error instanceof Error ? error.message : '投票失败，请稍后重试';
    if (message.includes('请先登录') || message.includes('登录状态已失效') || message.includes('请先输入手机号')) {
      clearPhoneSession();
      pendingWork.value = work;
      showLogin.value = true;
    }
    showToast(message);
  } finally {
    votingId.value = '';
    void loadPersonalStats();
  }
}

async function retryVote() {
  await loadPersonalStats();
  if (pendingWork.value) {
    handleVote(pendingWork.value);
    pendingWork.value = undefined;
  }
}

function goDetail(work: Work) {
  router.push(`/work/${work.id}`);
}

onMounted(async () => {
  try {
    await Promise.all([loadBootstrap(),loadWorks()]);
    void api.recordVisit('/vote').catch(()=>undefined);
    void loadPersonalStats();
  } catch(error) { showToast(error instanceof Error ? error.message : '作品加载失败，请稍后再试'); }
  finally {initialized=true;await nextTick();markListReady('/vote');}
});
onActivated(()=>{if(initialized) void Promise.all([loadBootstrap(),loadWorks(true),loadPersonalStats()]).catch(()=>undefined);});
onDeactivated(()=>{showLogin.value=false;toast.value='';});
</script>

<style scoped>
.stat-value.login-stat { font-size:15px; line-height:1.8; }
.personal-quota-note { margin:0 16px 10px; font-size:12px; text-align:center; color:var(--muted); }
.vote-hero {
  position: relative;
  background: var(--paper);
  overflow: hidden;
}
.visually-hidden { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap; border:0; }

.vote-hero-bg {
  display: block;
  width: 100%;
  height: auto;
  object-fit: contain;
  pointer-events: none;
}
.vote-phase { padding:8px 16px 0; }
.vote-phase .status-pill { margin:0; }

.rule-strip {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 14px 4px;
  padding: 13px 14px;
  border-radius: 13px;
  background: rgba(255, 251, 241, 0.84);
  border: 1px solid rgba(166, 109, 50, 0.18);
  color: #4e4137;
  font-size: 13px;
  line-height: 1.45;
}

.works-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 15px 16px 4px;
  color: var(--blue);
}

.works-heading strong {
  font-size: 18px;
}

.works-heading span {
  color: var(--muted);
  font-size: 13px;
}

.search-box .search-submit {
  flex: 0 0 auto;
  min-width: 58px;
  min-height: 32px;
  padding: 0 13px;
  border-radius: 999px;
  background: linear-gradient(180deg, #cf3d3d, #aa2e31);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
}

.work-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  padding: 14px 14px 28px;
}
</style>
