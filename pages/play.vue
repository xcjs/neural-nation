<script setup lang="ts">
import type { ModelChoice } from '~/stores/chat';
import { computed } from 'vue';

const route = useRoute();
const token = (route.query.token as string) || '';
const mode = route.query.mode as string | undefined;
const model = route.query.model as ModelChoice | undefined;

const gameScreenProps = computed(() => {
  const props: Record<string, unknown> = { token };
  if (mode !== undefined)
    props.mode = mode;
  if (model !== undefined)
    props.model = model;
  return props;
});
</script>

<template>
  <GameScreen v-bind="gameScreenProps" />
</template>
