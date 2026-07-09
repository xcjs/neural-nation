<template>
  <GameScreen spectator />
</template>

<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { useUiStore } from '~/stores/ui'

const route = useRoute()
const router = useRouter()
const ui = useUiStore()

const token = route.query.token as string

if (!token) {
  router.push('/')
}
</script>