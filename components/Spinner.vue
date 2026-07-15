<script setup lang="ts">
withDefaults(defineProps<{
  size?: string;
  color?: string;
}>(), {
  size: '1em',
  color: 'currentColor',
});
</script>

<template>
  <span
    class="inline-block animate-spin rounded-full border-2 border-solid border-current border-t-transparent align-middle"
    :style="{ width: size, height: size, borderColor: color, borderTopColor: 'transparent' }"
  />
</template>
