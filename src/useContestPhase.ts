import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import { contestPhase } from '../server/contestTime';
import type { AppBootstrap } from './types';

// Advance the server clock locally: an open page changes state without reloading
// the artwork list or making a request every second. Server still enforces votes.
export function useContestPhase(bootstrap: Ref<AppBootstrap | undefined>) {
  const now = ref(NaN);
  let serverAnchor = NaN, clockAnchor = 0;
  const tick = () => { now.value = serverAnchor + performance.now() - clockAnchor; };
  watch(bootstrap, (value) => {
    serverAnchor = Date.parse(value?.serverTime || ''); clockAnchor = performance.now(); tick();
  }, { immediate: true });
  let timer: ReturnType<typeof setInterval> | undefined;
  onMounted(() => { timer = setInterval(tick, 1000); document.addEventListener('visibilitychange', tick); });
  onBeforeUnmount(() => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); });
  return computed(() => bootstrap.value ? contestPhase(bootstrap.value.config, now.value) : 'pending');
}
