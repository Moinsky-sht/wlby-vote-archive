<template>
  <main class="phone-shell">
    <div class="mobile-page">
      <ContestName />
      <section class="hero rank">
        <img class="hero-bg" :src="'/assets/RankingHero_bg_v2.webp'" alt="" aria-hidden="true" decoding="async" fetchpriority="high" />
        <div class="hero-content">
          <h1 class="hero-title rank-hero-title">排名统计</h1>
          <div class="hero-subtitle rank-subtitle">实时公开网络投票排名</div>
        </div>
      </section>

      <section class="panel ranking-panel">
        <h2 class="panel-title">全部作品排名</h2>
        <p class="subtle">{{ bootstrap?.phase === 'ended' ? '最终网络投票排名' : '实时排名' }}，同票作品显示并列排名。</p>

        <template v-if="hasAnyVotes">
          <div v-if="topThree.length" class="top-three">
            <article
              v-for="slot in podiumSlots"
              :key="slot.item.work.id"
              :class="['podium-card', `podium-${slot.placement}`]"
              @click="$router.push(`/work/${slot.item.work.id}`)"
            >
              <span>{{ slot.item.rank }}</span>
              <img :src="displayAsset(slot.item.work.cover)" :alt="slot.item.work.title" loading="lazy" decoding="async" />
              <strong>{{ slot.item.work.title }}</strong>
              <em v-if="slot.item.work.votes > 0">{{ slot.item.work.votes }}票</em>
            </article>
          </div>

          <div v-if="restRankings.length" class="rank-list">
            <button v-for="item in restRankings" :key="item.work.id" class="rank-row" @click="$router.push(`/work/${item.work.id}`)">
              <span class="rank-no">{{ item.rank }}</span>
              <img :src="displayAsset(item.work.cover)" :alt="item.work.title" loading="lazy" decoding="async" />
              <span class="rank-info">
                <strong>{{ item.work.code }} {{ item.work.title }}</strong>
                <small>{{ item.work.author }}</small>
              </span>
              <em v-if="item.work.votes > 0" class="rank-votes">{{ item.work.votes }}票</em>
            </button>
          </div>
        </template>

        <div v-else-if="rankings.length" class="empty-state">投票尚未开始，暂无排名</div>
        <div v-else class="empty-state">暂无排名</div>
        <p class="update-note">数据更新时间：{{ updatedAtText }}</p>
      </section>
    </div>
    <BottomNav active="rank" />
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, onActivated, nextTick, ref } from 'vue';
import ContestName from '../components/ContestName.vue';
import { markListReady } from '../listNavigation';
import { displayAsset } from '../workMedia';
defineOptions({name:'RankingPage'});
let initialized=false;
import { api } from '../api';
import type { AppBootstrap, RankingItem } from '../types';
import BottomNav from '../components/BottomNav.vue';

const bootstrap = ref<AppBootstrap>();
const rankings = ref<RankingItem[]>([]);
const updatedAt = ref('');
const hasAnyVotes = computed(() => rankings.value.some((r) => r.work.votes > 0));
const topThree = computed(() => rankings.value.slice(0, 3));
const podiumSlots = computed(() =>
  [
    { placement: 'second', item: topThree.value[1] },
    { placement: 'first', item: topThree.value[0] },
    { placement: 'third', item: topThree.value[2] }
  ].filter((slot): slot is { placement: 'first' | 'second' | 'third'; item: RankingItem } => Boolean(slot.item))
);
const restRankings = computed(() => rankings.value.slice(3));
const updatedAtText = computed(() => (updatedAt.value ? new Date(updatedAt.value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : ''));

async function loadRankings() {
  const result = await api.getRankings();
  rankings.value = result.rankings;
  updatedAt.value = result.updatedAt;
}

onMounted(async () => {
  try {
    bootstrap.value = await api.getBootstrap();
    await loadRankings();
    void api.recordVisit('/rank').catch(()=>undefined);
  } finally { initialized=true;await nextTick();markListReady('/rank'); }
});
onActivated(()=>{if(initialized)void loadRankings().catch(()=>undefined);});
</script>

<style scoped>
.hero.rank {
  padding-top: 34px;
}

.rank-hero-title {
  max-width: none;
  margin: 0 auto;
  text-align: center;
  font-family: "Kaiti SC", "KaiTi", "STKaiti", "楷体", serif;
  font-size: 26px;
  line-height: 1.2;
  letter-spacing: 1.5px;
  font-weight: 800;
}

.rank-subtitle {
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

.ranking-panel {
  margin-top: 12px;
}

.top-three {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 9px;
  align-items: end;
  margin: 18px 0 16px;
  min-height: 164px;
}

.podium-card {
  min-width: 0;
  padding: 10px 7px;
  border-radius: 14px;
  background: #fff8e8;
  text-align: center;
  border: 1px solid rgba(196, 154, 82, 0.28);
  cursor: pointer;
}

.podium-first {
  grid-column: 2;
  padding-top: 18px;
  background: linear-gradient(180deg, #ffe0a0, #fff2cc);
  box-shadow: 0 9px 18px rgba(155, 94, 20, 0.15);
}

.podium-second {
  grid-column: 1;
  background: linear-gradient(180deg, #f4f1e8, #fff8e8);
}

.podium-third {
  grid-column: 3;
  background: linear-gradient(180deg, #f6dfc4, #fff3e2);
}

.top-three span {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--gold);
  color: #fff;
  font-weight: 800;
}

.top-three img {
  width: 100%;
  aspect-ratio: 297 / 420;
  object-fit: cover;
  display: block;
  margin: 8px 0;
  border-radius: 10px;
}

.top-three strong,
.top-three em {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-style: normal;
}

.top-three strong {
  color: var(--gold-deep);
  font-size: 13px;
}

.top-three em {
  margin-top: 4px;
  color: var(--red);
  font-size: 13px;
  font-weight: 800;
}

.top-three .podium-first img {
  margin: 10px 0;
}

.top-three .podium-first span {
  width: 28px;
  height: 28px;
  background: linear-gradient(180deg, #f2bf4b, #b87918);
}

.top-three .podium-second span {
  background: #a7aeb8;
}

.top-three .podium-third span {
  background: #bf8052;
}

.top-three .podium-first strong,
.top-three .podium-first em {
  font-size: 14px;
}

.rank-list {
  display: grid;
  gap: 9px;
}

.rank-row {
  width: 100%;
  display: grid;
  grid-template-columns: 30px 42px minmax(0, 1fr) 62px;
  gap: 8px;
  align-items: center;
  min-height: 78px;
  padding: 8px 8px 8px 0;
  border: 1px solid rgba(230, 120, 67, 0.35);
  border-radius: 12px;
  background: linear-gradient(180deg, #fffdf7, #fff6e9);
  text-align: left;
}

.rank-no {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  margin-left: 8px;
  border-radius: 50%;
  background: #fff0d6;
  color: var(--gold-deep);
  font-weight: 850;
}

.rank-row img {
  width: 42px;
  aspect-ratio: 297 / 420;
  object-fit: cover;
  border-radius: 8px;
}

.rank-info {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.rank-info strong,
.rank-info small,
.rank-info i {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rank-info strong {
  color: var(--ink);
  font-size: 14px;
  line-height: 1.25;
  font-weight: 800;
}

.rank-info small {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.25;
}

.rank-info i {
  width: fit-content;
  max-width: 100%;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(196, 154, 82, 0.12);
  color: var(--gold-deep);
  font-size: 11px;
  line-height: 1.25;
  font-style: normal;
}

.rank-votes {
  justify-self: end;
  color: var(--gold-deep);
  font-style: normal;
  font-weight: 800;
  font-size: 14px;
  white-space: nowrap;
}

.update-note {
  margin: 16px 0 0;
  color: #9d9488;
  text-align: center;
  font-size: 12px;
}
</style>
