<template>
  <div class="category-tabs">
    <button :class="{ active: modelValue === 'all' }" @click="$emit('update:modelValue', 'all')">
      {{ labelWithCount('全部', 'all') }}
    </button>
    <button
      v-for="theme in themes"
      :key="theme.id"
      :class="{ active: modelValue === theme.id }"
      @click="$emit('update:modelValue', theme.id)"
    >
      {{ labelWithCount(theme.name, theme.id) }}
    </button>
  </div>
</template>

<script setup lang="ts">
import type { Theme, ThemeId } from '../types';

const props = defineProps<{ themes: Theme[]; modelValue: ThemeId; counts?: Partial<Record<ThemeId, number>> }>();
defineEmits<{ 'update:modelValue': [value: ThemeId] }>();

function labelWithCount(label: string, id: ThemeId) {
  const count = props.counts?.[id];
  return typeof count === 'number' ? `${label}（${count}）` : label;
}
</script>

<style scoped>
.category-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 14px 0 0;
  padding: 0 14px 4px;
}

button {
  min-width: 0;
  min-height: 36px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(255, 252, 245, 0.9);
  color: #635a51;
  border: 1px solid rgba(173, 125, 62, 0.18);
  font-size: 13px;
  font-weight: 750;
  line-height: 1.2;
  box-shadow: 0 4px 12px rgba(88, 56, 23, 0.06);
  white-space: normal;
  word-break: keep-all;
}

button.active {
  background: linear-gradient(180deg, #d74d49, #a52b2e);
  color: #fff;
  border-color: transparent;
}
</style>
