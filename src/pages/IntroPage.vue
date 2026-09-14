<template>
  <main class="phone-shell">
    <div class="mobile-page">
      <section class="intro-hero">
        <img class="intro-banner" :src="bannerImages[0].url + '?direct=1'"
          :srcset="bannerImages.map(image => image.url + '?direct=1 ' + image.width + 'w').join(', ')"
          sizes="(max-width: 520px) 100vw, 520px"
          :width="bannerImages[1].width" :height="bannerImages[1].height"
          :alt="CONTEST_TITLE" decoding="async" fetchpriority="high" />
        <h1 class="visually-hidden">{{ CONTEST_TITLE }}</h1>
      </section>

      <section class="panel intro-card" v-if="bootstrap">
        <h2 class="panel-title">大赛介绍</h2>
        <div class="organizers">
          <div v-for="item in bootstrap.config.organizerText" :key="item">{{ item }}</div>
        </div>

        <div class="timeline">
          <div>
            <Flag :size="19" />
            <span>大赛主题</span>
            <strong>{{ bootstrap.config.slogan }}</strong>
          </div>
          <div>
            <CalendarDays :size="19" />
            <span>投票开始</span>
            <strong>{{ fullDate(bootstrap.config.voteStart) }}</strong>
          </div>
          <div>
            <TimerOff :size="19" />
            <span>投票结束</span>
            <strong>{{ fullDate(bootstrap.config.voteEnd) }}</strong>
          </div>
          <div>
            <ShieldCheck :size="19" />
            <span>投票规则</span>
            <strong>{{ bootstrap.config.rules }}</strong>
          </div>
        </div>
      </section>

      <section class="panel notice" v-if="bootstrap">
        <h2 class="panel-title">比赛通知全文</h2>
        <div class="notice-scroll-wrap">
          <div class="notice-body">
            <p
              v-for="(block, index) in noticeBlocks"
              :key="`${block.text}-${index}`"
              :class="block.className"
            >
              {{ block.text }}
            </p>
          </div>
        </div>
        <button class="btn-primary enter-btn" @click="$router.push('/vote')">进入作品投票</button>
      </section>
    </div>
    <BottomNav active="intro" />
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { CalendarDays, Flag, ShieldCheck, TimerOff } from 'lucide-vue-next';
import { api } from '../api';
import type { AppBootstrap } from '../types';
import BottomNav from '../components/BottomNav.vue';
import { CONTEST_TITLE } from '../contest';
import bannerImages from '../data/contest-banner.json';

const bootstrap = ref<AppBootstrap>();

const noticeBlocks = computed(() => {
  const text = bootstrap.value?.config.notice || '比赛通知暂未发布';
  const lines = text
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const signatureIndex = lines.findIndex((item) => /^北京市民族宗教事务委员会/.test(item));
  const visibleLines = lines.filter((item, index) => {
    if (/^附件：/.test(item)) return false;
    if (item === '2.北京市青年铸牢中华民族共同体意识文创设计大赛素材参考') return false;
    if (signatureIndex > -1 && index < signatureIndex && /^\d+\./.test(item) && item.includes('北京市青年铸牢')) {
      return false;
    }
    return true;
  });

  return visibleLines.map((item, index) => {
      let className = 'notice-paragraph';
      if (item === '关于举办北京市青年铸牢中华民族共同体意识' || item === '文创设计大赛的通知') {
        className = 'notice-title';
      } else if (/^[一二三四五六七八九十]、/.test(item)) {
        className = 'notice-heading';
      } else if (/^（[一二三四五六七八九十]+）/.test(item)) {
        className = 'notice-subheading';
      } else if (/^主题[一二三四]：/.test(item) || /^类型[一二三]：/.test(item)) {
        className = 'notice-subheading';
      } else if (index >= visibleLines.length - 3 && (/^北京市民族宗教事务委员会/.test(item) || /^2026年/.test(item))) {
        className = 'notice-signature';
      } else if (/^附件：/.test(item)) {
        className = 'notice-attachment';
      } else if (/^\d+\./.test(item)) {
        className = 'notice-list';
      } else if (/^各区委/.test(item)) {
        className = 'notice-recipient';
      } else if (isShortStandaloneLine(item)) {
        className = 'notice-plain';
      }
      return { text: item, className };
    });
});

function isShortStandaloneLine(text: string) {
  return text.length <= 28 && !/[。；，,]/.test(text);
}

function fullDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间待确认';
  return date.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

onMounted(async () => {
  await api.recordVisit('/intro');
  bootstrap.value = await api.getBootstrap();
});
</script>

<style scoped>
.intro-hero { width:100%; }
.intro-banner { display:block; width:100%; height:auto; object-fit:contain; }
.visually-hidden { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap; border:0; }

.intro-card {
  margin-top: 14px;
}

.intro-card p {
  color: #443b32;
  font-size: 14px;
  line-height: 1.85;
}

.organizers {
  display: grid;
  gap: 9px;
  margin: 16px 0;
  padding: 14px;
  border-radius: 12px;
  background: rgba(250, 244, 232, 0.9);
  color: var(--gold-deep);
  font-size: 13px;
  line-height: 1.65;
}

.timeline {
  display: grid;
  gap: 13px;
  margin-top: 16px;
}

.timeline div {
  display: grid;
  grid-template-columns: 24px 72px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
  color: var(--red);
}

.timeline span {
  color: var(--gold-deep);
  font-size: 13px;
  font-weight: 750;
}

.timeline strong {
  color: var(--ink);
  font-size: 13px;
  line-height: 1.65;
  font-weight: 500;
  word-break: break-word;
}

.notice {
  margin-top: 14px;
  margin-bottom: 24px;
}

.notice-scroll-wrap {
  position: relative;
  max-height: min(54vh, 560px);
  overflow: hidden;
  border-radius: 12px;
  background: rgba(255, 253, 248, 0.7);
  border: 1px solid rgba(166, 109, 50, 0.12);
}

.notice-scroll-wrap::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 34px;
  pointer-events: none;
  background: linear-gradient(180deg, rgba(255, 253, 248, 0), rgba(255, 253, 248, 0.96));
}

.notice-body {
  max-height: min(54vh, 560px);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 14px 14px 34px;
  color: #39342e;
  font-size: 14px;
  line-height: 1.9;
}

.notice-body p {
  margin: 0 0 10px;
}

.notice-title {
  color: var(--blue);
  text-align: center;
  font-family: "Songti SC", "STSong", "SimSun", serif;
  font-size: 15px;
  line-height: 1.45;
  font-weight: 800;
  text-indent: 0;
  white-space: nowrap;
}

.notice-title + .notice-title {
  margin-top: -7px;
  margin-bottom: 16px;
}

.notice-recipient {
  text-indent: 0;
  font-weight: 650;
}

.notice-heading {
  margin-top: 18px;
  color: var(--red-dark);
  font-size: 16px;
  font-weight: 850;
  text-indent: 0;
}

.notice-subheading {
  margin-top: 12px;
  color: var(--gold-deep);
  font-weight: 800;
  text-indent: 0;
}

.notice-paragraph {
  text-indent: 2em;
}

.notice-plain {
  text-indent: 0;
}

.notice-list {
  padding-left: 1.4em;
  text-indent: -1.4em;
}

.notice-attachment {
  margin-top: 14px;
  text-indent: 0;
}

.notice-signature {
  margin-top: 14px;
  text-align: right;
  text-indent: 0;
  font-weight: 650;
}

.enter-btn {
  width: 100%;
  margin-top: 14px;
}
</style>
