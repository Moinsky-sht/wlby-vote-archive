<template>
  <main class="admin-page login-page">
    <form class="admin-card login-card" @submit.prevent="login">
      <ContestName />
      <h1>后台管理登录</h1>
      <p>固定管理员账号登录，不提供找回流程。</p>
      <label class="field">
        账号
        <input v-model="username" autocomplete="username" />
      </label>
      <label class="field">
        密码
        <input v-model="password" type="password" autocomplete="current-password" />
      </label>
      <p v-if="errorMessage" role="alert">{{ errorMessage }}</p>
      <button class="btn-primary" :disabled="loading">{{ loading ? '登录中…' : '登录' }}</button>
    </form>
  </main>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import ContestName from '../components/ContestName.vue';
import { useRouter } from 'vue-router';
import { api } from '../api';

const router = useRouter();
const username = ref('');
const password = ref('');
const loading = ref(false);
const errorMessage = ref('');

async function login() {
  loading.value = true;
  errorMessage.value = '';
  try {
    await api.adminLogin(username.value, password.value);
    await router.push('/admin');
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '登录失败';
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  display: grid;
  place-items: center;
  padding: 24px;
}

.login-card {
  width: min(420px, 100%);
  display: grid;
  gap: 16px;
  padding: 28px;
}

h1 {
  margin: 0;
  color: var(--blue);
}

p {
  margin: 0;
  color: var(--muted);
}
</style>
