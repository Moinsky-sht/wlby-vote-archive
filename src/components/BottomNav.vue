<template>
  <nav class="bottom-nav">
    <RouterLink class="nav-item" :class="{ active: activeKey === 'intro' }" to="/intro">
      <BookOpen :size="22" />
      <span>介绍</span>
    </RouterLink>
    <RouterLink class="nav-item" :class="{ active: activeKey === 'vote' }" to="/vote">
      <BadgeCheck :size="22" />
      <span>投票</span>
    </RouterLink>
    <RouterLink class="nav-item" :class="{ active: activeKey === 'rank' }" to="/rank">
      <BarChart3 :size="22" />
      <span>排名</span>
    </RouterLink>
    <RouterLink class="nav-item" :class="{ active: activeKey === 'me' }" to="/me">
      <UserRound :size="22" />
      <span>我的</span>
    </RouterLink>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { BadgeCheck, BarChart3, BookOpen, UserRound } from 'lucide-vue-next';

const props = defineProps<{ active?: 'intro' | 'vote' | 'rank' | 'me' }>();
const route = useRoute();

const activeKey = computed(() => {
  if (props.active) return props.active;
  if (route.path.startsWith('/intro')) return 'intro';
  if (route.path.startsWith('/rank')) return 'rank';
  if (route.path.startsWith('/me')) return 'me';
  return 'vote';
});
</script>

<style scoped>
.bottom-nav {
  position: fixed;
  left: 50%;
  bottom: 0;
  z-index: 60;
  width: min(100vw, 430px);
  transform: translateX(-50%);
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  min-height: calc(78px + env(safe-area-inset-bottom));
  padding: 8px 8px calc(10px + env(safe-area-inset-bottom));
  border-top: 1px solid rgba(159, 95, 33, 0.28);
  background:
    radial-gradient(circle at 18% 30%, rgba(196, 154, 82, 0.12) 0 1px, transparent 2px),
    radial-gradient(circle at 70% 20%, rgba(196, 154, 82, 0.09) 0 1px, transparent 2px),
    linear-gradient(180deg, rgba(255, 250, 240, 0.98), rgba(255, 241, 216, 0.98));
  background-size: 24px 24px, 34px 34px, auto;
  box-shadow: 0 -4px 16px rgba(89, 55, 21, 0.1);
}

.nav-item {
  min-height: 58px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  color: #7d6c59;
  text-decoration: none;
  font-size: 12px;
  font-weight: 650;
  line-height: 1;
  border-radius: 12px;
}

.nav-item.active {
  color: var(--red);
  font-weight: 800;
}

.nav-item svg {
  display: block;
  flex: 0 0 auto;
}

.nav-item span {
  display: block;
  line-height: 1;
  white-space: nowrap;
}
</style>
