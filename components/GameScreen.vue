<script setup lang="ts">
import type { ModelChoice } from '~/stores/chat';
import type { ChangelogEntry } from '~/types/changelog';
import { $fetch } from 'ofetch';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import EarthGlobe from '~/components/EarthGlobe.vue';
import ActionConsole from '~/components/hud/ActionConsole.vue';
import ChatPanel from '~/components/hud/ChatPanel.vue';
import EnvironmentStatus from '~/components/hud/EnvironmentStatus.vue';
import EventFeed from '~/components/hud/EventFeed.vue';
import FacilityDetailPanel from '~/components/hud/FacilityDetailPanel.vue';
import PowerGridPanel from '~/components/hud/PowerGridPanel.vue';
import ResourceTracker from '~/components/hud/ResourceTracker.vue';
import SpaceStatusPanel from '~/components/hud/SpaceStatusPanel.vue';
import TechTreePanel from '~/components/hud/TechTreePanel.vue';
import TerrainModsPanel from '~/components/hud/TerrainModsPanel.vue';
import TokenManagement from '~/components/hud/TokenManagement.vue';
import Spinner from '~/components/Spinner.vue';
import { useGameSSE } from '~/composables/useGameSSE';
import { useActionsStore } from '~/stores/actions';
import { useEnvironmentStore } from '~/stores/environment';
import { useEventsStore } from '~/stores/events';
import { useFacilitiesStore } from '~/stores/facilities';
import { useGameStore } from '~/stores/game';
import { usePowerStore } from '~/stores/power';
import { useResourcesStore } from '~/stores/resources';
import { useSpaceStore } from '~/stores/space';
import { useTechTreeStore } from '~/stores/techtree';
import { useTerrainStore } from '~/stores/terrain';
import { useTransportsStore } from '~/stores/transports';
import { type PanelId, useUiStore } from '~/stores/ui';

const props = defineProps<{ spectator?: boolean; token?: string; mode?: string; model?: ModelChoice }>();

const router = useRouter();
const token = props.token || '';
const { version } = useRuntimeConfig().public;
const changelog = ref<ChangelogEntry[]>([]);
const changelogOpen = ref(false);

if (!token && import.meta.client) {
  router.push('/');
}

const game = useGameStore();
const resources = useResourcesStore();
const facilities = useFacilitiesStore();
const transports = useTransportsStore();
const events = useEventsStore();
const actions = useActionsStore();
const techtree = useTechTreeStore();
const environment = useEnvironmentStore();
const terrain = useTerrainStore();
const power = usePowerStore();
const space = useSpaceStore();
const ui = useUiStore();

const sse = useGameSSE(token);

const inBrowserMode = computed(() => props.mode === 'inbrowser' && props.model);

const panelButtons: Array<{ id: PanelId; label: string }> = [
  { id: 'resourceTracker', label: 'RESOURCES' },
  { id: 'environmentStatus', label: 'ENVIRONMENT' },
  { id: 'eventFeed', label: 'EVENTS' },
  { id: 'actionConsole', label: 'ACTIONS' },
  { id: 'techTree', label: 'TECH' },
  { id: 'facilityDetail', label: 'FACILITY' },
  { id: 'powerGrid', label: 'POWER' },
  { id: 'spaceStatus', label: 'SPACE' },
  { id: 'terrainMods', label: 'TERRAIN' },
  { id: 'tokenManagement', label: 'MCP' },
  ...(inBrowserMode.value ? [{ id: 'chatPanel' as PanelId, label: 'CHAT' }] : []),
];

const statusColor = computed(() => {
  switch (game.tick.status) {
    case 'Active': return 'text-green-400';
    case 'Paused': return 'text-yellow-400';
    case 'GameOver': return 'text-red-400';
    default: return 'text-cyan-500';
  }
});

const connectionDot = computed(() => {
  switch (ui.connectionStatus) {
    case 'connected': return 'bg-green-400';
    case 'reconnecting': return 'bg-yellow-400 animate-pulse';
    default: return 'bg-red-400';
  }
});

onMounted(async () => {
  ui.detectMobile();
  ui.reset();
  game.reset();
  resources.reset();
  facilities.reset();
  transports.reset();
  events.reset();
  actions.reset();
  techtree.reset();
  environment.reset();
  terrain.reset();
  power.reset();
  space.reset();

  if (props.spectator) {
    ui.spectatorMode = true;
  }

  if (inBrowserMode.value) {
    ui.panelVisibility.chatPanel = true;
    ui.panelVisibility.tokenManagement = false;
  }

  if (!props.spectator && import.meta.client) {
    const privateToken = sessionStorage.getItem(`nn-private-${token}`);
    if (privateToken) {
      game.privateToken = privateToken;
    }
  }

  await game.fetchState(token);
  changelog.value = await $fetch<ChangelogEntry[]>('/api/changelog');
  sse.connect();
});

onUnmounted(() => {
  sse.disconnect();
});

watch(() => ui.selectedFacilityId, (id) => {
  if (id !== null)
    facilities.fetchDetail(token, id);
});
</script>

<template>
  <div class="relative w-screen h-screen overflow-hidden bg-black">
    <!-- Mobile warning overlay -->
    <div
      v-if="ui.isMobile"
      class="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/95 text-center p-8"
    >
      <h2 class="text-2xl text-red-400 font-bold mb-4">
        DESKTOP ONLY
      </h2>
      <p class="text-cyan-600 text-sm max-w-md">
        Neural Nation requires a desktop browser with WebGL support. Please switch to a desktop computer.
      </p>
    </div>

    <!-- Game Over overlay -->
    <div
      v-if="game.meta?.status === 'GameOver'"
      class="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/90 text-center p-8"
    >
      <h2 class="text-3xl text-red-400 font-bold mb-2 tracking-widest">
        GAME OVER
      </h2>
      <p class="text-cyan-500 text-sm mb-4">
        Resources depleted. The economy has collapsed.
      </p>
      <div class="text-cyan-600 text-xs space-y-1 mb-6">
        <p>Ticks survived: {{ game.tick.tickCount }}</p>
        <p>Final pollution: {{ environment.state.pollutionLevel.toFixed(0) }}</p>
      </div>
      <NuxtLink to="/" class="px-6 py-2 border border-cyan-400 text-cyan-300 hover:bg-cyan-950 text-sm">
        START NEW GAME
      </NuxtLink>
    </div>

    <!-- 3D Earth canvas (full screen) -->
    <div class="absolute inset-0 z-0">
      <ClientOnly>
        <EarthGlobe :facilities="facilities.list" :transports="transports.list" :quality="ui.quality" :terrain-modifications="terrain.modifications" :pollution-level="environment.state.pollutionLevel" :forest-coverage="environment.state.forestCoverage" :biodiversity="environment.state.biodiversity" :water-quality="environment.state.waterQuality" :token="token" @facility-click="ui.selectFacility" />
        <template #fallback>
          <div class="w-full h-full flex items-center justify-center gap-2">
            <Spinner size="1rem" class="text-cyan-700" />
            <p class="text-cyan-700 text-sm">
              INITIALIZING GLOBE...
            </p>
          </div>
        </template>
      </ClientOnly>
    </div>

    <!-- HUD overlay -->
    <div class="absolute inset-0 z-10 pointer-events-none">
      <!-- Top bar: game overview -->
      <div class="absolute top-0 left-0 right-0 pointer-events-auto bg-black/80 border-b border-cyan-900/50 backdrop-blur-sm">
        <div class="flex items-center justify-between px-4 py-2">
          <div class="flex items-center gap-4">
            <span class="text-cyan-400 font-bold text-sm tracking-wider">NEURAL NATION</span>
            <span class="text-cyan-800 text-xs">v{{ version }}</span>
            <span v-if="spectator" class="text-yellow-500 text-xs border border-yellow-800 px-2 py-0.5">SPECTATING</span>
          </div>
          <div class="flex items-center gap-4 text-xs text-cyan-500">
            <span>TICK: {{ game.tick.tickCount }}</span>
            <span :class="statusColor">{{ game.tick.status }}</span>
            <span class="flex items-center gap-1">
              <span :class="connectionDot" class="w-2 h-2 rounded-full inline-block" />
              {{ ui.connectionStatus }}
            </span>
            <span v-if="game.meta?.status === 'Active'" class="text-cyan-600 flex items-center gap-1">
              <Spinner size="0.8rem" color="rgb(8 145 178)" />
              WAITING FOR LLM...
            </span>
            <button
              v-if="changelog.length"
              class="text-cyan-600 hover:text-cyan-400 text-xs underline"
              @click="changelogOpen = true"
            >
              WHAT'S NEW?
            </button>
            <span v-else class="flex items-center">
              <Spinner size="0.7rem" class="text-cyan-800" />
            </span>
          </div>
        </div>
      </div>

      <!-- Left panel stack -->
      <div class="absolute top-12 left-0 bottom-9 w-80 pointer-events-auto overflow-y-auto p-2 space-y-2">
        <ResourceTracker v-if="ui.panelVisibility.resourceTracker" />
        <EnvironmentStatus v-if="ui.panelVisibility.environmentStatus" />
        <PowerGridPanel v-if="ui.panelVisibility.powerGrid" />
        <SpaceStatusPanel v-if="ui.panelVisibility.spaceStatus" />
      </div>

      <!-- Right panel stack -->
      <div class="absolute top-12 right-0 bottom-9 w-80 pointer-events-auto overflow-y-auto p-2 space-y-2">
        <ChatPanel v-if="ui.panelVisibility.chatPanel && inBrowserMode" :token="token" :model="props.model as ModelChoice" />
        <EventFeed v-if="ui.panelVisibility.eventFeed" />
        <ActionConsole v-if="ui.panelVisibility.actionConsole" />
        <TechTreePanel v-if="ui.panelVisibility.techTree" />
        <FacilityDetailPanel v-if="ui.panelVisibility.facilityDetail" />
        <TerrainModsPanel v-if="ui.panelVisibility.terrainMods" />
        <TokenManagement v-if="ui.panelVisibility.tokenManagement && !spectator" />
      </div>

      <!-- Bottom: panel toggle bar -->
      <div class="absolute bottom-0 left-0 right-0 z-20 pointer-events-auto bg-black/80 border-t border-cyan-900/50 backdrop-blur-sm">
        <div class="flex items-center justify-center gap-1 px-4 py-1 flex-wrap">
          <button
            v-for="panel in panelButtons"
            :key="panel.id"
            class="px-2 py-1 text-xs border transition-colors" :class="[
              ui.panelVisibility[panel.id]
                ? 'border-cyan-400 bg-cyan-950 text-cyan-300'
                : 'border-cyan-900 text-cyan-700 hover:border-cyan-700',
            ]"
            @click="ui.togglePanel(panel.id)"
          >
            {{ panel.label }}
          </button>
        </div>
      </div>
    </div>

    <ChangelogPanel v-if="changelog.length" v-model:open="changelogOpen" :data="changelog" />
  </div>
</template>
