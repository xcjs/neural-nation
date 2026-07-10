import { defineStore } from 'pinia'
import { ref } from 'vue'

export type PanelId =
  | 'resourceTracker'
  | 'eventFeed'
  | 'actionConsole'
  | 'environmentStatus'
  | 'techTree'
  | 'facilityDetail'
  | 'tokenManagement'
  | 'powerGrid'
  | 'spaceStatus'
  | 'terrainMods'

export const useUiStore = defineStore('ui', () => {
  const selectedFacilityId = ref<number | null>(null)
  const selectedTransportId = ref<number | null>(null)
  const selectedResourceKey = ref<string | null>(null)
  const panelVisibility = ref<Record<PanelId, boolean>>({
    resourceTracker: true,
    eventFeed: true,
    actionConsole: false,
    environmentStatus: true,
    techTree: false,
    facilityDetail: false,
    tokenManagement: false,
    powerGrid: false,
    spaceStatus: false,
    terrainMods: false,
  })
  const spectatorMode = ref(false)
  const isMobile = ref(false)
  const quality = ref<'low' | 'medium' | 'high'>('high')
  const connectionStatus = ref<'connected' | 'disconnected' | 'reconnecting'>('disconnected')

  function togglePanel(id: PanelId) {
    panelVisibility.value[id] = !panelVisibility.value[id]
  }

  function selectFacility(id: number | null) {
    selectedFacilityId.value = id
    if (id !== null)
      panelVisibility.value.facilityDetail = true
  }

  function selectTransport(id: number | null) {
    selectedTransportId.value = id
  }

  function selectResource(key: string | null) {
    selectedResourceKey.value = key
  }

  function detectMobile() {
    if (typeof window === 'undefined')
      return
    const ua = navigator.userAgent
    isMobile.value = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)
  }

  function reset() {
    selectedFacilityId.value = null
    selectedTransportId.value = null
    selectedResourceKey.value = null
    panelVisibility.value = {
      resourceTracker: true,
      eventFeed: true,
      actionConsole: false,
      environmentStatus: true,
      techTree: false,
      facilityDetail: false,
      tokenManagement: false,
      powerGrid: false,
      spaceStatus: false,
      terrainMods: false,
    }
    spectatorMode.value = false
    connectionStatus.value = 'disconnected'
  }

  return {
    selectedFacilityId,
    selectedTransportId,
    selectedResourceKey,
    panelVisibility,
    spectatorMode,
    isMobile,
    quality,
    connectionStatus,
    togglePanel,
    selectFacility,
    selectTransport,
    selectResource,
    detectMobile,
    reset,
  }
})
