<template>
  <router-view v-slot="{ Component, route }">
    <KeepAlive :include="['VotePage', 'RankingPage']">
      <component :is="Component" :key="route.path" />
    </KeepAlive>
  </router-view>
</template>
