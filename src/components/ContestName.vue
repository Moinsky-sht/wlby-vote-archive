<template><p class="contest-name">{{ CONTEST_TITLE }}</p></template>
<script setup lang="ts">import { CONTEST_TITLE } from '../contest';</script>
<style scoped>
.contest-name { margin:0; padding:12px 16px; color:var(--blue); background:var(--paper); font-size:14px; line-height:1.65; text-align:center; font-weight:700; overflow-wrap:anywhere; }
</style>
