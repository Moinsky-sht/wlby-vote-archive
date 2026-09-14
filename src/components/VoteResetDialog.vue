<template>
  <dialog ref="dialog" class="vote-reset-dialog" aria-labelledby="vote-reset-title" aria-describedby="vote-reset-description" @cancel.prevent="close">
    <h2 id="vote-reset-title">清零全部票数</h2>
    <p id="vote-reset-description">这会清零所有作品（包括已下架作品）的票数及排行榜，清空当前投票记录和用户累计已投票数。所有用户将重新获得投票额度。</p>
    <p>原投票记录会先归档留存，供管理员联系维护人员恢复。账号、作品内容、图片视频、浏览量和大赛设置不会改变。</p>
    <p>清零范围以实际执行时为准；清零后仍按原有时间安排开放投票。</p>
    <template v-if="!completed">
      <label for="vote-reset-confirm">确认执行，请输入：<strong>清零全部票数</strong></label>
      <input id="vote-reset-confirm" v-model="confirmation" :disabled="busy" autocomplete="off" placeholder="清零全部票数" />
    </template>
    <p v-if="error" class="reset-error" role="alert">{{ error }}</p>
    <p v-if="completed" role="status">已完成清零，原记录已归档。新的投票会正常计入。</p>
    <div class="reset-actions">
      <button type="button" class="btn-secondary" :disabled="busy" autofocus @click="close">{{ completed ? '关闭' : '取消' }}</button>
      <button v-if="!completed" type="button" class="btn-primary" :disabled="busy || confirmation !== '清零全部票数'" @click="submit">{{ busy ? '正在归档并清零…' : '确认清零全部票数' }}</button>
    </div>
  </dialog>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { api } from '../api';
const emit = defineEmits<{ close: []; completed: [] }>();
const dialog = ref<HTMLDialogElement>();
const confirmation = ref(''), error = ref(''), busy = ref(false), completed = ref(false);
const pendingKey = 'h5-vote-pending-reset';
let previousOverflow = '';
onMounted(() => {
  previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  dialog.value?.showModal();
});
onBeforeUnmount(() => { dialog.value?.close(); document.body.style.overflow = previousOverflow; });
function close() { if (!busy.value) emit('close'); }
async function submit() {
  if (busy.value || completed.value || confirmation.value !== '清零全部票数') return;
  busy.value = true; error.value = '';
  try {
    // Keep uncertain requests stable across closing/reopening or refreshing.
    const requestId = sessionStorage.getItem(pendingKey) || crypto.randomUUID();
    sessionStorage.setItem(pendingKey, requestId);
    await api.resetAllVotes(requestId, confirmation.value);
    completed.value = true;
    sessionStorage.removeItem(pendingKey);
    emit('completed');
  } catch (cause) {
    error.value = `${cause instanceof Error ? cause.message : '暂未收到清零结果'}。可重新确认重试，同一次请求不会重复清零。`;
  } finally { busy.value = false; }
}
</script>

<style scoped>
.vote-reset-dialog{width:min(520px,calc(100vw - 24px));box-sizing:border-box;max-height:calc(100dvh - 24px);overflow:auto;padding:22px;border:1px solid var(--muted);border-radius:16px;background:var(--paper);color:var(--blue)}
.vote-reset-dialog::backdrop{background:rgba(0,0,0,.6)}
h2{margin:0;font-size:22px}p{line-height:1.7;font-size:15px}label{display:block;margin:18px 0 8px;font-size:15px}
input{box-sizing:border-box;width:100%;padding:12px;min-height:44px;border:1px solid var(--muted);border-radius:8px;background:var(--paper);color:var(--blue);font-size:16px}
.reset-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px}.reset-actions button{flex:1;min-width:140px;min-height:44px}.reset-error{color:var(--red)}
button:disabled{opacity:.5;cursor:not-allowed}:focus-visible{outline:2px solid var(--red);outline-offset:3px}
</style>
