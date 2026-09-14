<template>
  <!-- This standalone H5 project reuses its existing login component and native dialog focus management. -->
  <dialog ref="dialogEl" class="modal" aria-labelledby="auth-title" @cancel.prevent="close" @click="onBackdrop">
    <form @submit.prevent="submit">
      <h2 id="auth-title">手机号{{ mode === 'login' ? '登录' : '注册' }}</h2>
      <div class="mode-tabs" role="group" aria-label="选择登录或注册">
        <button type="button" :aria-pressed="mode === 'login'" :class="{active:mode === 'login'}" :disabled="busy" @click="switchMode('login')">登录</button>
        <button type="button" :aria-pressed="mode === 'register'" :class="{active:mode === 'register'}" :disabled="busy" @click="switchMode('register')">注册</button>
      </div>
      <p class="lead">{{ mode === 'login' ? '注册过的手机号填写号码即可登录。' : '首次注册需短信验证码，之后可直接登录，无需密码。' }}</p>
      <p v-if="!options.phone && mode === 'register'" class="security-note">短信注册暂不可用，请稍后重试。</p>
      <label class="field-label">手机号
        <input v-model.trim="phone" type="tel" inputmode="numeric" autocomplete="tel" placeholder="请输入手机号" maxlength="11" :disabled="busy" required />
      </label>
      <div v-if="mode === 'register'" class="code-row">
        <label class="field-label">验证码
          <input v-model.trim="code" inputmode="numeric" autocomplete="one-time-code" placeholder="6位验证码" maxlength="6" :disabled="loading" required />
        </label>
        <button type="button" class="btn-secondary" :disabled="busy || countdown > 0 || !options.phone" @click="sendCode">{{ countdown > 0 ? countdown + '秒后重发' : sending ? '发送中…' : '获取验证码' }}</button>
      </div>
      <p v-if="notice" class="security-note" role="status">{{ notice }}</p>
      <p class="security-note">每个账号每24小时最多3票，不同账号独立计算。</p>
      <p v-if="errorMessage" class="error-message" role="alert">{{ errorMessage }}</p>
      <div class="actions">
        <button type="button" class="btn-secondary" :disabled="busy" @click="close">取消</button>
        <button class="btn-primary" :disabled="busy || (mode === 'register' && !options.phone)">{{ loading ? '处理中…' : mode === 'login' ? '登录' : '验证并注册' }}</button>
      </div>
    </form>
  </dialog>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { api, savePhoneSession } from '../api';
type Mode = 'login' | 'register';
const props = defineProps<{ modelValue: boolean; initialMode?: Mode }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; success: [] }>();
const dialogEl = ref<HTMLDialogElement>();
const mode = ref<Mode>('login');
const phone = ref(''), code = ref('');
const loading = ref(false), sending = ref(false), countdown = ref(0);
const errorMessage = ref(''), notice = ref('');
const options = ref({phone:false});
const busy = computed(() => loading.value || sending.value);
let timer: ReturnType<typeof setInterval> | undefined;
async function syncDialog() {
  if (props.modelValue) {
    mode.value = props.initialMode || 'login';
    code.value = ''; errorMessage.value = ''; notice.value = '';
    if (!dialogEl.value?.open) dialogEl.value?.showModal();
    options.value = await api.getAuthOptions().catch(() => ({phone:false}));
  } else dialogEl.value?.close();
}
watch(() => props.modelValue, syncDialog, {flush:'post'});
onMounted(syncDialog);
onBeforeUnmount(() => { if(timer) clearInterval(timer); dialogEl.value?.close(); });
function switchMode(value: Mode) { mode.value = value; code.value = ''; errorMessage.value = ''; notice.value = ''; }
function close() { if (!busy.value) emit('update:modelValue',false); }
function onBackdrop(event: MouseEvent) { if(event.target === dialogEl.value) { const r=dialogEl.value.getBoundingClientRect(); if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom) close(); } }
function validate() {
  const valid = /^1\d{10}$/.test(phone.value);
  if (!valid) errorMessage.value = '请输入正确的手机号';
  return valid;
}
async function sendCode() {
  errorMessage.value = ''; notice.value = '';
  if (!validate()) return;
  sending.value = true;
  try {
    const result = await api.sendAuthCode('phone',mode.value,phone.value);
    notice.value = result.message;
    countdown.value = 120;
    if(timer) clearInterval(timer);
    timer = setInterval(() => { countdown.value = Math.max(0,countdown.value-1); if(!countdown.value && timer) clearInterval(timer); },1000);
  } catch(e) { errorMessage.value = e instanceof Error ? e.message : '验证码发送失败'; }
  finally { sending.value = false; }
}
async function submit() {
  errorMessage.value = '';
  if (!validate()) return;
  if(mode.value === 'register' && !/^\d{6}$/.test(code.value)) { errorMessage.value = '请输入6位验证码'; return; }
  loading.value = true;
  try {
    const session = await api.verifyAuthCode('phone',mode.value,phone.value,code.value);
    savePhoneSession(session); emit('update:modelValue',false); emit('success');
  } catch(e) { errorMessage.value = e instanceof Error ? e.message : '验证失败，请稍后再试'; }
  finally { loading.value = false; }
}
</script>

<style scoped>
.modal { width:min(390px,calc(100vw - 28px)); max-height:calc(100dvh - 32px); overflow:auto; padding:22px; border:1px solid rgba(166,109,50,.25); border-radius:12px; background:var(--paper); color:var(--blue); box-shadow:0 18px 50px rgba(0,0,0,.24); }
.modal::backdrop { background:rgba(0,0,0,.42); }
h2 { margin:0; color:var(--red-dark); font-size:22px; }
.lead,.security-note { margin:10px 0 6px; color:var(--muted); font-size:13px; line-height:1.65; }
.field-label { display:block; margin-top:12px; font-size:14px; }
input { width:100%; min-height:46px; margin-top:5px; padding:0 12px; border:1px solid rgba(166,109,50,.32); border-radius:8px; background:var(--paper); color:var(--blue); }
:focus-visible { outline:2px solid var(--red); outline-offset:3px; }
button:disabled { opacity:.5; cursor:not-allowed; }
.mode-tabs { display:grid; grid-template-columns:1fr 1fr; margin:12px 0 2px; border-bottom:1px solid rgba(166,109,50,.22); }
.mode-tabs button { min-height:44px; background:transparent; color:var(--muted); font-weight:700; }
.mode-tabs button.active { border-bottom:2px solid var(--red); color:var(--red-dark); }
.code-row { display:grid; grid-template-columns:minmax(0,1fr) 112px; gap:8px; align-items:end; }
.code-row button { min-height:46px; padding:0 6px; border-radius:8px; font-size:13px; }
.error-message { margin:8px 0 0; font-size:13px; color:var(--red-dark); }
.actions { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:18px; }
.actions button { min-height:44px; }
</style>
