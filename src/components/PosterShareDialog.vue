<template>
  <dialog ref="dialogEl" class="poster-dialog" aria-labelledby="poster-dialog-title" @cancel.prevent="close">
    <header>
      <div><p class="contest-caption">{{ CONTEST_TITLE }}</p><h2 id="poster-dialog-title">作品分享海报</h2></div>
      <button type="button" class="close-button" aria-label="关闭分享海报" @click="close">×</button>
    </header>
    <div class="poster-image-area">
      <img :src="imageUrl" alt="作品分享海报，长按可保存图片" draggable="false" />
    </div>
    <footer>
      <p class="save-hint">{{ guidance }}</p>
      <p v-if="status" class="save-status" role="status">{{ status }}</p>
      <div class="poster-buttons">
        <button type="button" class="btn-primary" :disabled="sharing" @click="shareImage">{{ sharing ? '正在打开…' : '转发给朋友' }}</button>
        <button type="button" :class="canShare ? 'btn-secondary' : 'btn-primary'" @click="downloadImage">下载海报</button>
      </div>
      <section v-if="guide" class="poster-guide" role="status">
        <h3>{{ guide === 'save' ? '保存分享海报' : '将海报发送给朋友' }}</h3>
        <p v-if="guide === 'friend'">{{ isWechat ? '长按上方海报，选择“发送给朋友”。如果没有此选项，先保存图片，再从微信聊天窗口选择图片发送。' : '下载海报后，在微信或其他聊天工具中选择这张图片发送给朋友。' }}</p>
        <p v-else>长按上方海报，选择“保存图片”。若没有保存菜单，请从微信右上角“…”选择在浏览器中打开，再点击“下载海报”。</p>
      </section>
    </footer>
  </dialog>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { CONTEST_TITLE } from '../contest';
import { shareCancelled } from '../sharing';
const props = defineProps<{ imageUrl: string; file: File; downloadHref?:string }>();
const emit = defineEmits<{ close: [] }>();
const dialogEl = ref<HTMLDialogElement>();
const status = ref(''), sharing = ref(false);
const guide=ref<'friend'|'save'>();
const isWechat = /micromessenger/i.test(navigator.userAgent);
const isMobile = /iphone|ipad|android|mobile/i.test(navigator.userAgent) || (/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const canShare = computed(() => {
  try { return typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({files:[props.file]}); }
  catch { return false; }
});
const guidance = computed(() => isWechat
  ? '长按上方海报，选择“保存图片”。若未出现菜单，可从微信右上角选择在浏览器中打开。'
  : isMobile ? '长按海报可保存图片；也可打开系统分享菜单，选择“存储图像”或发送给朋友。'
  : '下载后可在浏览器下载列表中找到图片，再发送给朋友。');
// Prepare the File before the click so native sharing retains the user gesture.
const downloadUrl = URL.createObjectURL(props.file);
let previousOverflow='';
onMounted(() => {previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';dialogEl.value?.showModal();});
onBeforeUnmount(() => { dialogEl.value?.close();document.body.style.overflow=previousOverflow;URL.revokeObjectURL(downloadUrl); });
function close() { if(!sharing.value) emit('close'); }
function downloadImage() {
  if(isWechat && !props.downloadHref) { guide.value='save';status.value = '请长按上方海报保存。'; return; }
  const link = document.createElement('a');
  link.href = props.downloadHref || downloadUrl; link.download = props.file.name;
  if(isWechat){link.target='_blank';link.rel='noopener';}
  document.body.appendChild(link); link.click(); link.remove();
  status.value = isWechat ? '已尝试下载；若微信未开始下载，请长按上方海报保存。' : isMobile ? '已发起下载，请检查浏览器下载列表；如需保存到相册，请长按海报或使用系统分享菜单。' : '已发起下载，请在浏览器下载列表中查看。';
}
async function shareImage() {
  if(sharing.value) return;
  if(isWechat || !canShare.value){guide.value='friend';return;}
  sharing.value = true; status.value = '';
  try {
    await navigator.share({files:[props.file]});
    status.value = '已返回作品页面，请以所选应用中的发送结果为准。';
  } catch(e) {
    status.value = shareCancelled(e) ? '已取消分享，仍可长按海报保存。' : '未能打开系统分享，请长按海报或下载图片。';
  } finally { sharing.value = false; }
}
</script>

<style scoped>
.poster-dialog { width:min(470px,calc(100vw - 24px)); max-height:calc(100dvh - 24px); padding:0; border:1px solid rgba(166,109,50,.22); border-radius:16px; background:var(--paper); color:var(--blue); overflow:hidden; }
.poster-dialog[open] { display:flex; flex-direction:column; }
.poster-dialog::backdrop { background:rgba(0,0,0,.5); }
header { flex:none; display:flex; align-items:center; justify-content:space-between; padding:8px 12px 8px 18px; }
h2 { font-size:18px; margin:0; }
.contest-caption { margin:0 0 3px; font-size:12px; line-height:1.5; color:var(--muted); }
.close-button { flex:none; }
.close-button { width:44px; height:44px; background:transparent; color:var(--blue); font-size:28px; }
.poster-image-area { min-height:0; overflow:auto; padding:0 12px; -webkit-overflow-scrolling:touch; }
.poster-image-area img { display:block; width:100%; height:auto; max-height:calc(100dvh - 255px); object-fit:contain; -webkit-touch-callout:default; user-select:auto; }
footer { flex:0 1 auto; min-height:0; overflow:auto; padding:10px 12px max(12px,env(safe-area-inset-bottom)); border-top:1px solid rgba(166,109,50,.16); }
.poster-image-area { flex:1 1 auto; min-height:140px; }
.poster-guide { margin-top:10px; padding:10px; border-radius:8px; background:rgba(157,104,38,.08); }
.poster-guide h3 { margin:0 0 6px; font-size:14px; }
.poster-guide p { margin:0; font-size:13px; line-height:1.7; }
.save-hint,.save-status { margin:0 0 8px; font-size:13px; line-height:1.6; color:var(--muted); }
.save-status { color:var(--red-dark); }
.poster-buttons { display:flex; flex-wrap:wrap; gap:8px; }
.poster-buttons button { flex:1; min-width:95px; min-height:44px; padding:8px; font-size:13px; }
:focus-visible { outline:2px solid var(--red); outline-offset:-3px; }
</style>
