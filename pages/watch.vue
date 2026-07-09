<template>
  <PlayPage spectator />
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUiStore } from '~/stores/ui'
import { useGameStore } from '~/stores/game'
import { useResourcesStore } from '~/stores/resources'
import { useFacilitiesStore } from '~/stores/facilities'
import { useTransportsStore } from '~/stores/transports'
import { useEnvironmentStore } from '~/stores/environment'
import { useEventsStore } from '~/stores/events'
import { useActionsStore } from '~/stores/actions'
import { useTechTreeStore } from '~/stores/techtree'
import { useTerrainStore } from '~/stores/terrain'
import { usePowerStore } from '~/stores/power'
import { useSpaceStore } from '~/stores/space'

const route = useRoute()
const router = useRouter()
const ui = useUiStore()

const token = route.query.token as string

if (!token) {
  router.push('/')
}

onMounted(() => {
  ui.spectatorMode = true
})
</script>