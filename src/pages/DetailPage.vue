<template>
  <main class="phone-shell">
    <div class="mobile-page detail-page" v-if="work">
      <ContestName />
      <header class="detail-top">
        <button type="button" class="back-button" @click="goBack"><ChevronLeft :size="20" />返回上一级</button>
        <strong>{{ work.code }}</strong>
        <button aria-label="分享作品" @click="openShareSheet"><Share2 :size="21" /></button>
      </header>

      <section class="media-view">
        <button v-if="currentMedia?.type === 'image'" class="image-stage" aria-label="查看高清原图" @click="lightbox = true">
          <img :src="displayAsset(currentMedia.url)" :alt="currentMedia.title || work.title" decoding="async" fetchpriority="high" />
        </button>
        <video
          v-else-if="currentMedia"
          :src="currentMedia.url"
          :poster="displayAsset(currentMedia.poster || work.cover)"
          controls
          preload="metadata"
          playsinline
        />
        <div class="pager" v-if="sortedMedia.length > 1">
          <button aria-label="上一张作品素材" :disabled="mediaIndex === 0" @click="mediaIndex -= 1"><ChevronLeft :size="18" /></button>
          <span>{{ mediaIndex + 1 }}/{{ sortedMedia.length }}</span>
          <button aria-label="下一张作品素材" :disabled="mediaIndex === sortedMedia.length - 1" @click="mediaIndex += 1"><ChevronRight :size="18" /></button>
        </div>
      </section>
      <p v-if="currentMedia?.type === 'image'" class="original-hint">点击图片查看高清原图，可缩放、拖动或下载。</p>

      <section class="panel title-block">
        <div>
          <h1>{{ work.code }} {{ work.title }}</h1>
          <p>作者：{{ work.author }}</p>
        </div>
        <strong v-if="work.votes > 0">{{ work.votes }}票</strong>
      </section>

      <section class="panel">
        <h2 class="panel-title">作品说明</h2>
        <p class="description">{{ work.description }}</p>
      </section>

      <section class="panel meta-list">
        <dl>
          <div><dt>作品主题</dt><dd>{{ work.themeName }}</dd></div>
          <div><dt>作品类别</dt><dd>{{ fullCategory }}</dd></div>
          <div><dt>单位/学校</dt><dd>{{ work.meta.school || '未填写' }}</dd></div>
        </dl>
      </section>

      <div class="detail-actions">
        <button class="btn-secondary" @click="openShareSheet"><Share2 :size="18" /> 分享</button>
        <button class="btn-secondary" @click="reportWork"><Flag :size="18" /> 举报</button>
        <button class="btn-primary" :disabled="voteDisabled || voting" @click="handleVote">{{ voteButtonText }}</button>
      </div>
    </div>

    <div v-else class="mobile-page">
      <div class="empty-state">{{ loadingText }}</div>
    </div>

    <OriginalImageDialog v-if="lightbox && currentMedia?.type === 'image'" :url="originalImage(currentMedia.url)?.displayUrl || currentMedia.url"
      :original-url="originalImage(currentMedia.url)?.url || currentMedia.url" :preview-url="displayAsset(currentMedia.url)"
      :width="originalImage(currentMedia.url)?.width" :height="originalImage(currentMedia.url)?.height"
      :title="(work?.code || '') + ' ' + (currentMedia.title || work?.title || '作品图片')" :filename="(work?.code || '作品') + '-原图'" @close="lightbox = false" />

    <BottomNav active="vote" />
    <LoginModal v-model="showLogin" @success="handleVote" />

    <div v-if="showShareSheet" class="share-mask" @click.self="showShareSheet = false">
      <section class="share-sheet">
        <ContestName />
        <h2>作品分享</h2>
        <button @click="shareLink"><LinkIcon :size="20" /> 分享链接</button>
        <button :disabled="creatingPoster" @click="createPoster"><ImageIcon :size="20" /> {{ creatingPoster ? '正在生成…' : '分享海报' }}</button>
        <button class="cancel" @click="showShareSheet = false">取消</button>
      </section>
    </div>

    <div v-if="showReportModal" class="report-mask" @click.self="closeReportModal">
      <section class="report-modal">
        <h2>举报作品</h2>
        <p>请选择举报原因，主办方会在后台核实处理。</p>
        <div class="report-options">
          <button
            v-for="reason in reportReasons"
            :key="reason"
            type="button"
            :class="{ active: reportReason === reason }"
            @click="reportReason = reason"
          >
            {{ reason }}
          </button>
        </div>
        <label class="report-field">
          <span>补充说明（选填）</span>
          <textarea v-model.trim="reportDescription" maxlength="500" placeholder="请补充具体情况"></textarea>
        </label>
        <label class="report-field">
          <span>联系方式（选填）</span>
          <input v-model.trim="reportContact" maxlength="80" placeholder="手机号、微信或邮箱" />
        </label>
        <div class="report-actions">
          <button class="btn-secondary" type="button" @click="closeReportModal">取消</button>
          <button class="btn-primary" type="button" :disabled="reporting" @click="submitReport">
            {{ reporting ? '提交中…' : '提交举报' }}
          </button>
        </div>
      </section>
    </div>

    <PosterShareDialog v-if="posterUrl && posterFile" :image-url="posterUrl" :file="posterFile" :download-href="posterDownloadHref" @close="posterUrl = ''; posterFile = undefined; posterDownloadHref = undefined" />
    <LinkShareDialog v-if="linkShare" :payload="linkShare" :initial-status="linkCopyStatus" @close="linkShare = undefined" />

    <div v-if="toast" class="toast" role="status" aria-live="polite">{{ toast }}</div>
  </main>
</template>

<script setup lang="ts">
import PosterShareDialog from '../components/PosterShareDialog.vue';
import LinkShareDialog from '../components/LinkShareDialog.vue';
import { copyShareLink, type LinkShareData } from '../sharing';
import preparedPosters from '../data/share-posters.json';
import OriginalImageDialog from '../components/OriginalImageDialog.vue';
import ContestName from '../components/ContestName.vue';
import { originalImage, orderedWorkMedia, displayAsset } from '../workMedia';
import { CONTEST_TITLE, CONTEST_TITLE_LINES } from '../contest';
import { useContestPhase } from '../useContestPhase';
import { computed, onMounted, onBeforeUnmount, ref, shallowRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import * as QRCode from 'qrcode';
import { ChevronLeft, ChevronRight, Flag, Image as ImageIcon, Link as LinkIcon, Share2 } from 'lucide-vue-next';
import { api, clearPhoneSession, restorePhoneSession, savePhoneSession } from '../api';
import type { AppBootstrap, Work } from '../types';
import BottomNav from '../components/BottomNav.vue';
import LoginModal from '../components/LoginModal.vue';

const route = useRoute();
const router = useRouter();
function goBack() {
  const previous=router.options.history.state.back;
  if(typeof previous==='string' && /^\/(vote|rank|me)([?#]|$)/.test(previous)) router.back();
  else router.push({path:'/vote',hash:'#work-'+String(route.params.id)});
}
const bootstrap = ref<AppBootstrap>();
const phase = useContestPhase(bootstrap);
const work = ref<Work>();
const mediaIndex = ref(0);
const showLogin = ref(false);
const voting = ref(false);
const toast = ref('');
const lightbox = ref(false);
const loadingText = ref('正在加载作品…');
const showShareSheet = ref(false);
const linkShare=ref<LinkShareData>();
const linkCopyStatus=ref('');
const posterUrl = ref('');
const posterFile = shallowRef<File>();
const posterDownloadHref=ref<string>();
const creatingPoster = ref(false);
const showReportModal = ref(false);
const reportReason = ref('');
const reportDescription = ref('');
const reportContact = ref('');
const reporting = ref(false);
const reportReasons = ['作品信息有误', '疑似侵权', '内容不当', '疑似刷票', '其他'];

const sortedMedia = computed(() => orderedWorkMedia(work.value));
const currentMedia = computed(() => sortedMedia.value[mediaIndex.value]);
const voteDisabled = computed(() => phase.value !== 'active');
const fullCategory = computed(() => {
  const category = work.value?.meta.category?.trim();
  if (!category) return '未填写';
  return category.endsWith('类') ? category : `${category}类`;
});
const voteButtonText = computed(() => {
  if (!bootstrap.value) return '为TA投票';
  if (phase.value === 'pending') return '投票尚未开始';
  if (phase.value === 'ended') return '投票已结束';
  return '为TA投票';
});

function showToast(message: string) {
  toast.value = message;
  window.setTimeout(() => {
    toast.value = '';
  }, 3500);
}

async function handleVote() {
  if (!work.value) return;
  if (!(await restorePhoneSession())) {
    showLogin.value = true;
    return;
  }
  voting.value = true;
  try {
    const result = await api.vote(work.value.id);
    if (result.session) savePhoneSession(result.session);
    work.value = result.work;
    showToast(result.message);
  } catch (error) {
    const message = error instanceof Error ? error.message : '投票失败，请稍后重试';
    if (message.includes('请先登录') || message.includes('登录状态已失效') || message.includes('请先输入手机号')) {
      clearPhoneSession();
      showLogin.value = true;
    }
    showToast(message);
  } finally {
    voting.value = false;
  }
}

function sharePayload() {
  if (!work.value) return;
  const url = new URL('/work/' + encodeURIComponent(work.value.id), window.location.origin).href;
  const title = `${work.value.code} ${work.value.title}｜${CONTEST_TITLE}`;
  const text = `我正在为参赛作品《${work.value.title}》投票，快来一起支持。`;
  return { url, title, text };
}

function openShareSheet() {
  if (!work.value) return;
  showShareSheet.value = true;
}

function reportWork() {
  if (!work.value) return;
  showReportModal.value = true;
}

function closeReportModal() {
  showReportModal.value = false;
}

async function submitReport() {
  if (!work.value) return;
  if (!reportReason.value) {
    showToast('请选择举报原因');
    return;
  }
  reporting.value = true;
  try {
    const result = await api.submitReport({
      workId: work.value.id,
      reason: reportReason.value,
      description: reportDescription.value,
      contact: reportContact.value
    });
    reportReason.value = '';
    reportDescription.value = '';
    reportContact.value = '';
    showReportModal.value = false;
    showToast(result.message);
  } catch (error) {
    showToast(error instanceof Error ? error.message : '举报提交失败，请稍后重试');
  } finally {
    reporting.value = false;
  }
}

async function shareLink() {
  const payload = sharePayload();
  if (!payload) return;
  // Copy on this click; do not consume the gesture by opening native sharing.
  const pendingCopy = copyShareLink(payload.url);
  showShareSheet.value = false;
  linkShare.value=payload;linkCopyStatus.value='正在复制作品链接…';
  linkCopyStatus.value=await pendingCopy ? '作品链接已复制，可粘贴发送给朋友。' : '未能自动复制，请长按上方链接全选复制。';
}

async function createPoster() {
  if (!work.value || creatingPoster.value) return;
  creatingPoster.value = true;
  showToast('正在生成高清海报…');
  try {
    const target=work.value;
    const prepared=(preparedPosters as Record<string,{url:string;code:string;title:string;author:string;cover:string}>)[target.id];
    const safeTitle = target.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
    if(prepared && ['code','title','author','cover'].every(key=>prepared[key as 'code'|'title'|'author'|'cover']===target[key as 'code'|'title'|'author'|'cover'])){
      try{
        const response=await fetch(prepared.url,{signal:typeof AbortSignal.timeout==='function'?AbortSignal.timeout(15000):undefined});
        if(!response.ok||!response.headers.get('content-type')?.includes('image/png'))throw new Error('Poster unavailable');
        posterFile.value=new File([await response.blob()],target.code+'-'+safeTitle+'-分享海报.png',{type:'image/png'});
        posterUrl.value=prepared.url+'?direct=1';posterDownloadHref.value=prepared.url+'?download=1';
        showShareSheet.value=false;toast.value='';return;
      }catch{/* Preserve dynamic generation for changed works or unavailable prepared images. */}
    }
    const url = new URL('/work/' + encodeURIComponent(work.value.id), window.location.origin).href;
    const image = await generatePoster(work.value, url);
    const blob = await (await fetch(image)).blob();
    posterFile.value = new File([blob], work.value.code + '-' + safeTitle + '-分享海报.png', { type: 'image/png' });
    posterDownloadHref.value=undefined;
    posterUrl.value = image;
    showShareSheet.value = false;
    toast.value = '';
  } catch {
    showToast('海报生成失败，请检查网络后重试');
  } finally { creatingPoster.value = false; }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    const timer = window.setTimeout(() => reject(new Error('图片加载超时')), 15000);
    image.onload = () => { window.clearTimeout(timer); resolve(image); };
    image.onerror = (error) => { window.clearTimeout(timer); reject(error); };
    image.src = src;
  });
}

async function loadQrCode(url: string) {
  const dataUrl = await QRCode.toDataURL(url, {
    width: 180,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#203657',
      light: '#ffffff'
    }
  });
  return loadImage(dataUrl);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function containImage(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const scale = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines = 3) {
  let line = '';
  let lines = 0;
  for (const char of text) {
    const test = `${line}${char}`;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y + lines * lineHeight);
      line = char;
      lines += 1;
      if (lines >= maxLines) return y + lines * lineHeight;
    } else {
      line = test;
    }
  }
  if (line && lines < maxLines) {
    ctx.fillText(line, x, y + lines * lineHeight);
    lines += 1;
  }
  return y + lines * lineHeight;
}

async function generatePoster(target: Work, url: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 750;
  canvas.height = 1280;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');

  ctx.fillStyle = '#fbf4e8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#fffaf0');
  gradient.addColorStop(1, '#f6e7cf');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#203657';
  ctx.font = '700 34px "Kaiti SC", "KaiTi", serif';
  ctx.textAlign = 'center';
  CONTEST_TITLE_LINES.forEach((line,index)=>ctx.fillText(line,375,43+index*37));
  ctx.fillStyle = '#758096';
  ctx.font = '500 24px "Kaiti SC", "KaiTi", serif';
  ctx.fillText('我正在为参赛作品投票，快来一起支持。', 375, 151);

  const [image, qrCode] = await Promise.all([loadImage(target.cover), loadQrCode(url)]);
  ctx.save();
  roundRect(ctx, 205, 180, 340, 446, 26);
  ctx.clip();
  ctx.fillStyle = '#efe3cf';
  ctx.fillRect(205, 180, 340, 446);
  containImage(ctx, image, 205, 180, 340, 446);
  ctx.restore();

  ctx.strokeStyle = 'rgba(180, 124, 58, 0.45)';
  ctx.lineWidth = 3;
  roundRect(ctx, 205, 180, 340, 446, 26);
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#9b6d2f';
  ctx.font = '700 28px sans-serif';
  ctx.fillText(target.code, 60, 675);
  ctx.fillStyle = '#203657';
  ctx.font = '800 44px sans-serif';
  const afterTitle = wrapText(ctx, target.title, 60, 730, 630, 52, 2);

  ctx.fillStyle = '#6d665f';
  ctx.font = '500 22px sans-serif';
  wrapText(ctx, `作者：${target.author}`, 60, afterTitle + 22, 630, 26, 2);
  ctx.fillStyle = '#b93535';
  ctx.font = '800 34px sans-serif';
  if(target.votes > 0) ctx.fillText(`${target.votes} 票`, 60, afterTitle + 82);

  roundRect(ctx, 60, 946, 630, 72, 36);
  ctx.fillStyle = '#b93535';
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = '800 34px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('为TA投票', 375, 993);

  roundRect(ctx, 60, 1038, 630, 170, 28);
  ctx.fillStyle = 'rgba(255, 253, 247, 0.92)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(180, 124, 58, 0.22)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#203657';
  ctx.font = '800 30px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('长按识别二维码', 92, 1090);
  ctx.fillStyle = '#8f8171';
  ctx.font = '24px sans-serif';
  ctx.fillText('查看作品详情并为TA投票', 92, 1132);
  ctx.font = '18px sans-serif';
  wrapText(ctx, CONTEST_TITLE, 92, 1166, 390, 23, 2);

  roundRect(ctx, 518, 1057, 132, 132, 16);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.drawImage(qrCode, 526, 1065, 116, 116);

  return canvas.toDataURL('image/png');
}

onMounted(async () => {
  await api.recordVisit(`/work/${route.params.id}`);
  await restorePhoneSession();
  bootstrap.value = await api.getBootstrap();
  try {
    const result = await api.getWork(String(route.params.id));
    work.value = result.work;
    document.title=`${result.work.code} ${result.work.title}｜${CONTEST_TITLE}`;
  } catch (error) {
    loadingText.value = error instanceof Error ? error.message : '作品加载失败';
  }
});
onBeforeUnmount(()=>{document.title=CONTEST_TITLE;});
</script>

<style scoped>
.detail-top {
  display: grid;
  grid-template-columns: 116px 1fr 44px;
  position: sticky;
  top: 0;
  z-index: 20;
  align-items: center;
  min-height: 56px;
  padding: 8px 8px 0;
  background:
    linear-gradient(180deg, rgba(255, 249, 238, 0.98), rgba(250, 242, 226, 0.96)),
    radial-gradient(circle at 82% 64%, rgba(196, 154, 82, 0.12), transparent 28%);
  border-bottom: 1px solid rgba(169, 122, 64, 0.14);
  color: var(--blue);
}

.detail-top button {
  display: grid;
  place-items: center;
  min-height: 44px;
  background: transparent;
  color: var(--blue);
}
.detail-top .back-button { display:flex; align-items:center; gap:2px; font-size:14px; padding:4px; }
.original-hint { text-align:center; margin:8px 12px; font-size:13px; color:var(--muted); }

.detail-top strong {
  text-align: center;
}

.media-view {
  position: relative;
}

.image-stage,
video {
  width: 100%;
  padding: 0;
  display: block;
  background: #efe1c8;
}

video {
  aspect-ratio: 9 / 16;
  max-height: 75vh;
  margin: 0 auto;
  object-fit: contain;
}

.image-stage {
  display: grid;
  place-items: center;
  max-height: 75vh;
  overflow: hidden;
}

.image-stage img {
  max-width: 100%;
  height: auto;
  max-height: 75vh;
  object-fit: contain;
  display: block;
}

.lightbox img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.pager {
  position: absolute;
  left: 50%;
  bottom: 12px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 8px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.38);
  color: #fff;
}

.pager button {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
}

.title-block {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
}

.title-block h1 {
  margin: 0;
  color: var(--blue);
  font-size: 24px;
  line-height: 1.25;
}

.title-block p {
  margin: 8px 0 0;
  color: var(--muted);
}

.title-block span {
  align-self: start;
  max-width: 170px;
  padding: 4px 8px;
  border: 1px solid rgba(196, 154, 82, 0.44);
  border-radius: 999px;
  color: var(--gold-deep);
  font-size: 12px;
  white-space: nowrap;
}

.title-block strong {
  grid-column: 1 / -1;
  color: var(--red);
  font-size: 18px;
}

.description {
  margin: 0;
  color: #332d28;
  font-size: 15px;
  line-height: 1.9;
}

.meta-list dl {
  margin: 0;
  display: grid;
  gap: 10px;
}

.meta-list div {
  display: grid;
  grid-template-columns: 76px 1fr;
  gap: 10px;
}

.meta-list dt {
  color: var(--muted);
}

.meta-list dd {
  margin: 0;
  color: var(--ink);
}

.detail-actions {
  position: fixed;
  left: 50%;
  bottom: calc(78px + env(safe-area-inset-bottom));
  z-index: 55;
  width: min(100vw, 430px);
  transform: translateX(-50%);
  display: grid;
  grid-template-columns: 82px 82px minmax(0, 1fr);
  gap: 8px;
  padding: 10px 14px;
  background: rgba(255, 252, 246, 0.95);
  box-shadow: 0 -6px 18px rgba(78, 50, 19, 0.1);
}

.detail-page {
  padding-bottom: calc(158px + env(safe-area-inset-bottom));
}

.detail-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-width: 0;
  padding: 0 8px;
}

.lightbox {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.94);
  padding: 20px;
}

.lightbox img {
  max-width: 100vw;
  max-height: 100vh;
  object-fit: contain;
  background: transparent;
  user-select: none;
  -webkit-user-drag: none;
}

.lightbox-close {
  position: absolute;
  top: max(16px, env(safe-area-inset-top));
  right: max(16px, env(safe-area-inset-right));
  z-index: 1;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.28);
  backdrop-filter: blur(4px);
  cursor: pointer;
}

.lightbox-close:hover {
  background: rgba(255, 255, 255, 0.32);
}

.share-mask,
.report-mask {
  position: fixed;
  inset: 0;
  z-index: 130;
  display: grid;
  align-items: end;
  background: rgba(0, 0, 0, 0.38);
}

.share-sheet,
.report-modal {
  width: min(100vw, 430px);
  margin: 0 auto;
  padding: 18px 16px calc(18px + env(safe-area-inset-bottom));
  border-radius: 18px 18px 0 0;
  background: var(--paper);
  box-shadow: 0 -16px 44px rgba(0, 0, 0, 0.22);
}

.share-sheet h2,
.report-modal h2 {
  margin: 0 0 14px;
  color: var(--blue);
  font-size: 18px;
  text-align: center;
}

.share-sheet button {
  width: 100%;
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 10px;
  border-radius: 12px;
  background: #fffaf1;
  color: var(--gold-deep);
  border: 1px solid rgba(166, 109, 50, 0.22);
  font-weight: 800;
}

.share-sheet .cancel {
  color: var(--muted);
  background: transparent;
  border-color: transparent;
  font-weight: 650;
}

.report-modal p {
  margin: 0 0 14px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.7;
  text-align: center;
}

.report-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.report-options button {
  min-height: 38px;
  padding: 0 10px;
  border-radius: 999px;
  background: #fffaf1;
  color: var(--gold-deep);
  border: 1px solid rgba(166, 109, 50, 0.22);
  font-size: 14px;
  font-weight: 750;
}

.report-options button.active {
  background: var(--red);
  color: #fff;
  border-color: var(--red);
}

.report-field {
  display: grid;
  gap: 7px;
  margin-top: 12px;
  color: var(--muted);
  font-size: 13px;
}

.report-field textarea,
.report-field input {
  width: 100%;
  border: 1px solid rgba(166, 109, 50, 0.24);
  border-radius: 12px;
  background: #fffdf8;
  color: var(--ink);
  outline: 0;
}

.report-field textarea {
  min-height: 92px;
  resize: vertical;
  padding: 10px 12px;
  line-height: 1.6;
}

.report-field input {
  min-height: 42px;
  padding: 0 12px;
}

.report-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 14px;
}

</style>
