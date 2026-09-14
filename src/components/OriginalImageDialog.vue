<template>
  <dialog ref="dialogEl" class="original-dialog" aria-labelledby="original-image-title" @cancel.prevent="emit('close')">
    <header>
      <div><p class="contest-caption">{{ CONTEST_TITLE }}</p><h2 id="original-image-title">{{ title }} · 原图</h2></div>
      <button class="close-button" type="button" aria-label="关闭原图" @click="emit('close')">×</button>
    </header>
    <div class="image-tools" role="group" aria-label="图片缩放和下载">
      <button type="button" @click="fitWidth">适应宽度</button>
      <button type="button" @click="zoomTo(1)">原始尺寸</button>
      <button type="button" aria-label="缩小图片" :disabled="!hasDimensions || scale <= .03" @click="zoomTo(scale / 1.5)">−</button>
      <output aria-live="polite">{{ Math.round(scale * 100) }}%</output>
      <button type="button" aria-label="放大图片" :disabled="!hasDimensions || scale >= 3" @click="zoomTo(scale * 1.5)">＋</button>
      <a class="download-original" :href="downloadUrl" :download="filename" @click="downloadStarted">{{ hasLossless ? '下载高清图' : '下载原图' }}</a>
    </div>
    <p class="image-guidance">滚动或拖动查看细节，可放大、缩小；手机也可滑动查看。</p>
    <p class="image-quality" role="status">{{ loaded ? (hasLossless ? '高清图已加载 · 无损画质' : '高清原图已加载') : failed ? '高清图暂未加载，当前为预览图。' : '正在加载高清原图，先显示预览图…' }}</p>
    <p v-if="status" class="image-status" role="status">{{ status }}</p>
    <div ref="viewport" class="original-viewport" :class="{ dragging }" tabindex="0" aria-label="原图查看区域，可滚动查看细节"
      @pointerdown="startDrag" @pointermove="drag" @pointerup="endDrag" @pointercancel="endDrag">
      <div v-if="failed" class="image-error" role="alert"><p>原图加载失败，请检查网络后重试。</p><button type="button" @click="retry">重新加载</button></div>
      <div class="image-frame" :style="hasDimensions ? {width:imageWidth * scale + 'px',height:imageHeight * scale + 'px'} : undefined">
        <img v-if="previewUrl && !loaded" class="preview-image" :src="previewUrl" alt="" aria-hidden="true" draggable="false" />
        <img :key="imageKey" class="full-image" :class="{ ready:loaded }" :src="displayUrl" :alt="title"
          draggable="false" decoding="async" fetchpriority="high" @load="imageLoaded" @error="imageFailed" />
      </div>
    </div>
    <footer><a :href="displayUrl" target="_blank" rel="noopener">在新页面打开原图</a><a v-if="hasLossless" :href="originalDownloadUrl" :download="filename" @click="downloadStarted">下载原始文件</a><span v-if="hasDimensions">{{ imageWidth }} × {{ imageHeight }} 像素</span></footer>
  </dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, ref } from 'vue';
import { CONTEST_TITLE } from '../contest';
const props=defineProps<{url:string;originalUrl?:string;previewUrl?:string;width?:number;height?:number;title:string;filename:string}>();
const emit=defineEmits<{close:[]}>();
const dialogEl=ref<HTMLDialogElement>(),viewport=ref<HTMLDivElement>();
const loaded=ref(false),failed=ref(false),imageKey=ref(0),status=ref(''),dragging=ref(false);
const imageWidth=ref(props.width||1),imageHeight=ref(props.height||1),scale=ref(1);
const hasDimensions=computed(()=>imageWidth.value>1&&imageHeight.value>1);
const useOriginal=ref(false);
const displayUrl=computed(()=>useOriginal.value ? props.originalUrl || props.url : props.url);
const hasLossless=computed(()=>!!props.originalUrl&&displayUrl.value!==props.originalUrl);
let previousOverflow='',dragOrigin:{id:number;x:number;y:number;left:number;top:number}|undefined;
function asDownload(url:string){const u=new URL(url,location.origin);u.searchParams.set('download','1');return u.href;}
const downloadUrl=computed(()=>asDownload(displayUrl.value));
const originalDownloadUrl=computed(()=>asDownload(props.originalUrl||props.url));
onMounted(()=>{previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';dialogEl.value?.showModal();fitWidth();});
onBeforeUnmount(()=>{dialogEl.value?.close();document.body.style.overflow=previousOverflow;});
async function imageLoaded(event:Event){
  const img=event.target as HTMLImageElement;
  const needsFit=!hasDimensions.value;
  imageWidth.value=img.naturalWidth;imageHeight.value=img.naturalHeight;loaded.value=true;failed.value=false;
  if(needsFit){await nextTick();fitWidth();}
}
function imageFailed(){if(hasLossless.value){useOriginal.value=true;return;}failed.value=true;}
function fitWidth(){if(!hasDimensions.value||!viewport.value)return;scale.value=Math.min(1,viewport.value.clientWidth/imageWidth.value);viewport.value.scrollTo({left:0,top:0});}
async function zoomTo(value:number){
  const pane=viewport.value;if(!pane||!hasDimensions.value)return;
  const old=scale.value, x=(pane.scrollLeft+pane.clientWidth/2)/old, y=(pane.scrollTop+pane.clientHeight/2)/old;
  scale.value=Math.min(3,Math.max(.03,value));await nextTick();
  pane.scrollTo({left:x*scale.value-pane.clientWidth/2,top:y*scale.value-pane.clientHeight/2});
}
function startDrag(event:PointerEvent){
  // Touch uses the browser's native two-axis scrolling and pinch zoom; keep
  // native image long-press available. Mouse users can grab and drag the image.
  if(event.pointerType!=='mouse'||event.button!==0||!viewport.value||!hasDimensions.value)return;
  dragOrigin={id:event.pointerId,x:event.clientX,y:event.clientY,left:viewport.value.scrollLeft,top:viewport.value.scrollTop};
  viewport.value.setPointerCapture(event.pointerId);dragging.value=true;event.preventDefault();
}
function drag(event:PointerEvent){if(dragOrigin&&viewport.value){viewport.value.scrollLeft=dragOrigin.left+dragOrigin.x-event.clientX;viewport.value.scrollTop=dragOrigin.top+dragOrigin.y-event.clientY;}}
function endDrag(){if(dragOrigin&&viewport.value?.hasPointerCapture(dragOrigin.id))viewport.value.releasePointerCapture(dragOrigin.id);dragOrigin=undefined;dragging.value=false;}
function retry(){failed.value=false;loaded.value=false;imageKey.value++;}
function downloadStarted(){status.value=/micromessenger/i.test(navigator.userAgent)?'微信内如无法下载，请长按原图保存，或在浏览器中打开。':'已发起原图下载，请在浏览器下载列表中查看。';}
</script>

<style scoped>
.original-dialog { width:min(1100px,calc(100vw - 16px)); height:calc(100dvh - 16px); max-width:none; max-height:none; padding:0; border:1px solid var(--muted); border-radius:14px; background:var(--paper); color:var(--blue); overflow:hidden; }
.original-dialog[open] { display:flex; flex-direction:column; }
.original-dialog::backdrop { background:rgba(0,0,0,.75); }
header { display:flex; align-items:center; gap:8px; padding:10px 12px; flex:none; }
header>div { flex:1; min-width:0; }
h2 { margin:2px 0 0; font-size:16px; line-height:1.4; overflow-wrap:anywhere; }
.contest-caption { margin:0; color:var(--muted); font-size:12px; line-height:1.4; }
.close-button { flex:none; width:44px; min-height:44px; background:transparent; color:var(--blue); font-size:28px; }
.image-tools { display:flex; gap:6px; align-items:center; flex-wrap:wrap; padding:0 12px; flex:none; }
.image-tools button,.image-tools a,.image-error button { display:inline-flex; align-items:center; justify-content:center; min-height:44px; min-width:44px; padding:8px 10px; border-radius:8px; background:var(--blue); color:var(--paper); text-decoration:none; font-size:14px; }
.image-tools output { min-width:40px; text-align:center; font-size:13px; }
.image-guidance,.image-status,.image-quality { margin:6px 12px; font-size:13px; line-height:1.5; }
.image-quality { color:var(--muted); }
.image-status { color:var(--red); }
.original-viewport { flex:1; min-height:0; overflow:auto; overscroll-behavior:contain; touch-action:pan-x pan-y pinch-zoom; background:rgba(0,0,0,.08); cursor:grab; }
.original-viewport.dragging { cursor:grabbing; }
.original-viewport img { display:block; max-width:none; max-height:none; height:auto; margin:0; -webkit-touch-callout:default; }
.image-frame { position:relative; min-width:1px; min-height:1px; }
.original-viewport .preview-image { position:absolute; inset:0; width:100%; height:100%; }
.original-viewport .full-image { width:100%; height:100%; visibility:hidden; }
.original-viewport .full-image.ready { visibility:visible; }
.image-loading,.image-error { padding:24px; text-align:center; }
footer { flex:none; display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; padding:4px 12px; gap:8px; font-size:13px; }
footer a { color:var(--blue); display:inline-flex; align-items:center; min-height:44px; }
footer span { color:var(--muted); }
:focus-visible { outline:2px solid var(--red); outline-offset:-2px; }
button:disabled { opacity:.4; }
</style>
