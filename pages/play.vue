<script setup lang="ts">
const route = useRoute();
const token = (route.query.token as string) || '';
</script>

<template>
  <GameScreen :token="token" />
</template>
