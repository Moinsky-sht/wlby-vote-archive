<template>
  <article class="work-card" :id="'work-' + work.id">
    <span class="code">{{ work.code }}</span>
    <button class="cover-btn" @click="$emit('detail', work)">
      <img :src="displayAsset(work.cover)" :alt="work.title" loading="lazy" decoding="async" />
    </button>
    <h3>{{ work.title }}</h3>
    <p>{{ work.author }}</p>
    <span class="work-category">{{ fullCategory }}</span>
    <div v-if="work.votes > 0" class="vote-line">
      <Heart :size="15" />
      <strong>{{ work.votes }}</strong>
      <span>票</span>
    </div>
    <div class="card-actions">
      <button class="btn-primary" :disabled="disabled" @click="$emit('vote', work)">{{ buttonText }}</button>
      <button class="btn-secondary" @click="$emit('detail', work)">详情</button>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Heart } from 'lucide-vue-next';
import type { Work } from '../types';
import { displayAsset } from '../workMedia';

const props = defineProps<{ work: Work; buttonText: string; disabled: boolean }>();
defineEmits<{ vote: [work: Work]; detail: [work: Work] }>();

const fullCategory = computed(() => {
  const category = props.work.meta.category?.trim();
  if (!category) return '未填写类别';
  return category.endsWith('类') ? category : `${category}类`;
});
</script>

<style scoped>
.work-card {
  position: relative;
  min-width: 0;
  padding: 15px 12px 14px;
  border: 1px solid rgba(145, 92, 35, 0.35);
  border-radius: 16px;
  background: rgba(252, 238, 211, 0.68);
  box-shadow: 0 7px 16px rgba(77, 49, 18, 0.09);
}

.code {
  position: absolute;
  left: 0;
  top: 0;
  min-width: 58px;
  padding: 4px 9px 6px;
  border-radius: 15px 0 14px 0;
  background: rgba(128, 116, 92, 0.86);
  color: #fff;
  font-weight: 750;
}

.cover-btn {
  width: 100%;
  aspect-ratio: 297 / 420;
  margin-top: 16px;
  padding: 0;
  overflow: hidden;
  border-radius: 8px;
  background: #efe3cf;
  position: relative;
}

img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.video-mark {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 30px;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.42);
}

h3 {
  min-height: 44px;
  margin: 10px 0 4px;
  color: var(--gold-deep);
  font-size: 16px;
  line-height: 1.35;
  font-weight: 850;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

p {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.work-category {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  min-height: 22px;
  margin-top: 7px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(157, 104, 38, 0.12);
  color: #7a5428;
  font-size: 12px;
  font-weight: 750;
}

.vote-line {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 7px;
  color: var(--red);
  font-size: 13px;
}

.vote-line strong {
  color: var(--gold-deep);
  font-size: 17px;
}

.card-actions {
  display: grid;
  gap: 9px;
  margin-top: 10px;
}

.card-actions button {
  min-height: 34px;
  font-size: 14px;
}
</style>
