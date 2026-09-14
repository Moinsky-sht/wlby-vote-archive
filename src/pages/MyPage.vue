<template>
  <main class="phone-shell">
    <div class="mobile-page my-page">
      <ContestName />
      <section class="hero my-hero">
        <img class="hero-bg" :src="'/assets/MyHero_bg_v2.webp'" alt="" aria-hidden="true" decoding="async" fetchpriority="high" />
        <div class="hero-content">
          <h1 class="hero-title my-hero-title">个人中心</h1>
          <div class="hero-subtitle my-hero-subtitle">账号信息与投票记录</div>
        </div>
      </section>

      <section v-if="!profile" class="login-state">
        <UserRound :size="42" />
        <h2>登录后查看个人投票记录</h2>
        <p>首次注册需短信验证码，注册后填写手机号即可登录。</p>
        <button class="btn-primary" @click="showLogin = true">登录 / 注册</button>
      </section>

      <template v-else>
        <section class="account-band">
          <div>
            <span>{{ profile.accountType }}</span>
            <strong>{{ profile.maskedIdentifier }}</strong>
          </div>
          <button class="btn-secondary" @click="logout">退出登录</button>
        </section>

        <section class="vote-summary">
          <div><span>累计投票</span><strong>{{ profile.totalVotes }}</strong></div>
          <div><span>24小时内已投</span><strong>{{ profile.todayVotes }}</strong></div>
          <div><span>当前可投</span><strong>{{ profile.todayRemaining }}</strong></div>
        </section>
        <p class="quota-note">每个账号每24小时最多3票，同一网络下的不同账号独立计算。</p>

        <section class="history-section">
          <h2>投票记录</h2>
          <div v-if="records.length" class="history-list">
            <RouterLink v-for="record in records" :key="record.id" :to="`/work/${record.work.id}`" class="history-item">
              <div>
                <strong>{{ record.work.code }} {{ record.work.title }}</strong>
                <span>投给该作品 1 票</span>
              </div>
              <time>{{ formatDate(record.createdTime) }}</time>
            </RouterLink>
          </div>
          <div v-else class="empty-history">暂无投票记录</div>
        </section>
      </template>
    </div>

    <BottomNav active="me" />
    <LoginModal v-model="showLogin" @success="loadAccount" />
  </main>
</template>

<script setup lang="ts">
import ContestName from '../components/ContestName.vue';
import { onMounted, ref } from 'vue';
import { UserRound } from 'lucide-vue-next';
import { api, clearPhoneSession, restorePhoneSession } from '../api';
import type { UserProfile, UserVoteRecord } from '../types';
import BottomNav from '../components/BottomNav.vue';
import LoginModal from '../components/LoginModal.vue';

const profile = ref<UserProfile>();
const records = ref<UserVoteRecord[]>([]);
const showLogin = ref(false);

async function loadAccount() {
  try {
    const [profileResult, votesResult] = await Promise.all([api.getMyProfile(), api.getMyVotes()]);
    profile.value = profileResult.profile;
    records.value = votesResult.records;
  } catch {
    profile.value = undefined;
    records.value = [];
    clearPhoneSession();
  }
}

async function logout() {
  await api.logout().catch(() => undefined);
  clearPhoneSession();
  profile.value = undefined;
  records.value = [];
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

onMounted(async () => {
  await api.recordVisit('/me');
  if (await restorePhoneSession()) await loadAccount();
});
</script>

<style scoped>
.my-page {
  padding: 0 16px 108px;
}

.my-hero {
  height: 242px;
  min-height: 242px;
  margin: 0 -16px 16px;
  padding-top: 34px;
  background: #f8efe0;
}

.my-hero .hero-bg {
  object-position: center;
}

.my-hero-title {
  max-width: none;
  margin: 0 auto;
  text-align: center;
  font-family: "Kaiti SC", "KaiTi", "STKaiti", "楷体", serif;
  font-size: 26px;
  line-height: 1.2;
  letter-spacing: 1.5px;
  font-weight: 800;
}

.my-hero-subtitle {
  max-width: 230px;
  margin: 7px auto 0;
  color: #758096;
  text-align: center;
  font-family: "Kaiti SC", "KaiTi", "STKaiti", "楷体", serif;
  font-size: 12px;
  line-height: 1.35;
  letter-spacing: 1.6px;
  font-weight: 600;
}

h2,
p {
  margin: 0;
}

.login-state {
  min-height: 360px;
  display: grid;
  justify-items: center;
  align-content: center;
  gap: 12px;
  text-align: center;
  color: var(--muted);
}

.login-state h2 {
  color: var(--blue);
  font-size: 19px;
}

.login-state p {
  max-width: 280px;
  font-size: 14px;
  line-height: 1.65;
}

.login-state button {
  min-width: 180px;
  margin-top: 8px;
}

.account-band,
.vote-summary,
.history-section {
  border-bottom: 1px solid rgba(159, 95, 33, 0.18);
  background: rgba(255, 252, 246, 0.9);
}

.account-band {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px;
}

.account-band span,
.vote-summary span {
  display: block;
  color: var(--muted);
  font-size: 12px;
}

.account-band strong {
  display: block;
  margin-top: 5px;
  color: var(--blue);
  font-size: 19px;
}

.vote-summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  padding: 18px 8px;
  text-align: center;
}

.vote-summary div + div {
  border-left: 1px solid rgba(159, 95, 33, 0.16);
}

.vote-summary strong {
  display: block;
  margin-top: 7px;
  color: var(--red-dark);
  font-size: 24px;
}

.history-section {
  margin-top: 14px;
  padding: 18px;
}

.history-section h2 {
  color: var(--blue);
  font-size: 17px;
}


.history-list {
  margin-top: 10px;
}

.history-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 64px;
  border-top: 1px solid rgba(159, 95, 33, 0.14);
  color: inherit;
  text-decoration: none;
}

.history-item strong,
.history-item span {
  display: block;
}

.history-item strong {
  color: #40382f;
  font-size: 14px;
}

.history-item span,
.history-item time,
.empty-history {
  margin-top: 4px;
  color: var(--muted);
  font-size: 12px;
}

.history-item time {
  flex: 0 0 auto;
}

.empty-history {
  padding: 30px 0 18px;
  text-align: center;
}
</style>
