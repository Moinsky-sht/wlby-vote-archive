<template>
  <!-- This independent H5 app uses native dialogs for focus, Escape and modality. -->
  <dialog ref="dialogEl" class="link-share-dialog" aria-labelledby="link-share-title" @cancel.prevent="close">
    <header><h2 id="link-share-title">分享作品链接</h2><button type="button" aria-label="关闭链接分享" @click="close">×</button></header>
    <p class="work-title">{{ payload.title }}</p>
    <label for="share-work-url">作品页面链接</label>
    <input id="share-work-url" :value="payload.url" readonly @focus="selectLink" />
    <p class="share-status" role="status">{{ status || initialStatus }}</p>
    <div class="share-actions">
      <button type="button" class="btn-primary" :disabled="busy" @click="copy">复制链接</button>
      <button type="button" class="btn-secondary" :disabled="busy" @click="shareFriend">转发给朋友</button>
    </div>
    <div v-if="guide" class="share-guide" role="status">
      <h3>发送给朋友</h3>
      <p v-if="isWechat">点击微信右上角“…” → 选择“发送给朋友”，再确认发送。</p>
      <p v-else>复制上方作品链接，打开微信或其他聊天工具，粘贴到聊天窗口后发送。</p>
    </div>
    <p class="manual-copy">若未能自动复制，可长按上方链接全选复制。分享完成情况请以微信或所选应用为准。</p>
  </dialog>
</template>
<script setup lang="ts">
import {onMounted,onBeforeUnmount,ref} from 'vue';
import {copyShareLink,isWechatBrowser,shareCancelled,type LinkShareData} from '../sharing';
const props=defineProps<{payload:LinkShareData;initialStatus:string}>();
const emit=defineEmits<{close:[]}>();
const dialogEl=ref<HTMLDialogElement>(),status=ref(''),busy=ref(false),guide=ref<'friend'>();
const isWechat=isWechatBrowser();let previousOverflow='';
onMounted(()=>{previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';dialogEl.value?.showModal();});
onBeforeUnmount(()=>{dialogEl.value?.close();document.body.style.overflow=previousOverflow;});
function close(){if(!busy.value)emit('close');}
function selectLink(event:Event){(event.target as HTMLInputElement).select();}
async function copy(){busy.value=true;try{status.value=await copyShareLink(props.payload.url)?'作品链接已复制，可粘贴发送给朋友。':'未能自动复制，请长按上方链接全选复制。';}finally{busy.value=false;}}
async function shareFriend(){
  if(isWechat||typeof navigator.share!=='function'){guide.value='friend';return;}
  busy.value=true;status.value='';
  try{await navigator.share(props.payload);status.value='已返回作品页面，请以所选应用中的发送结果为准。';}
  catch(error){status.value=shareCancelled(error)?'已取消分享。':'未能打开系统分享，可复制链接发送。';if(!shareCancelled(error))guide.value='friend';}
  finally{busy.value=false;}
}
</script>
<style scoped>
.link-share-dialog{width:min(470px,calc(100vw - 24px));box-sizing:border-box;max-height:calc(100dvh - 24px);overflow:auto;padding:16px;border:1px solid var(--muted);border-radius:16px;background:var(--paper);color:var(--blue)}
.link-share-dialog::backdrop{background:rgba(0,0,0,.55)}
header{display:flex;align-items:center;justify-content:space-between;gap:8px}h2{font-size:20px;margin:0}header button{width:44px;height:44px;font-size:28px;background:transparent;color:var(--blue)}
.work-title{font-size:14px;line-height:1.6;overflow-wrap:anywhere}label{display:block;font-size:13px;margin:12px 0 6px}input{box-sizing:border-box;width:100%;min-height:44px;padding:10px;border:1px solid var(--muted);border-radius:8px;background:var(--paper);color:var(--blue);font-size:16px}
.share-status{font-size:15px;line-height:1.6;min-height:24px}.share-actions{display:flex;flex-wrap:wrap;gap:8px}.share-actions button{flex:1;min-width:112px;min-height:44px;font-size:14px}.share-guide{margin-top:14px;padding:12px;background:rgba(157,104,38,.08);border-radius:10px}.share-guide h3{font-size:16px;margin:0 0 8px}.share-guide p,.manual-copy{font-size:13px;line-height:1.7}.manual-copy{color:var(--muted)}.share-guide button{min-height:44px}:focus-visible{outline:2px solid var(--red);outline-offset:2px}
</style>
