import { onUnmounted } from 'vue'
import { useGameStore } from '~/stores/game'
import { useResourcesStore } from '~/stores/resources'
import { useFacilitiesStore } from '~/stores/facilities'
import { useTransportsStore } from '~/stores/transports'
import { useEventsStore } from '~/stores/events'
import { useActionsStore } from '~/stores/actions'
import { useTechTreeStore } from '~/stores/techtree'
import { useEnvironmentStore } from '~/stores/environment'
import { useTerrainStore } from '~/stores/terrain'
import { usePowerStore } from '~/stores/power'
import { useSpaceStore } from '~/stores/space'
import { useUiStore } from '~/stores/ui'
import type { FullGameState } from '~/lib/types/game'

interface SSEEvent {
  type: string
  [key: string]: unknown
}

export function useGameSSE(token: string) {
  const ui = useUiStore()
  const game = useGameStore()
  const resources = useResourcesStore()
  const facilities = useFacilitiesStore()
  const transports = useTransportsStore()
  const events = useEventsStore()
  const actions = useActionsStore()
  const techtree = useTechTreeStore()
  const environment = useEnvironmentStore()
  const terrain = useTerrainStore()
  const power = usePowerStore()
  const space = useSpaceStore()

  let source: EventSource | null = null
  let reconnectAttempts = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  const maxReconnect = 30

  function connect() {
    if (source) source.close()
    ui.connectionStatus = 'reconnecting'
    source = new EventSource(`/api/events?token=${token}`)

    source.onopen = () => {
      reconnectAttempts = 0
      ui.connectionStatus = 'connected'
    }

    source.onmessage = (e) => {
      try {
        const data: SSEEvent = JSON.parse(e.data)
        dispatch(data)
      } catch {
        // ignore malformed
      }
    }

    source.onerror = () => {
      ui.connectionStatus = 'disconnected'
      source?.close()
      source = null
      if (reconnectAttempts < maxReconnect) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000)
        reconnectTimer = setTimeout(() => {
          reconnectAttempts++
          connect()
        }, delay)
      }
    }
  }

  function dispatch(event: SSEEvent) {
    switch (event.type) {
      case 'full_state': {
        const state = event.state as FullGameState
        game.applyUpdate({ meta: state.meta, tick: state.tick })
        if (state.resources) resources.applyUpdate({ rows: state.resources })
        if (state.facilities) facilities.list = state.facilities
        if (state.transports) transports.list = state.transports
        if (state.environment) environment.applyUpdate({ type: 'environment_updated', environment: state.environment })
        if (state.techTree) techtree.nodes = state.techTree
        if (state.power) power.applyUpdate({ type: 'power_updated', power: state.power })
        if (state.space) space.applyUpdate({ type: 'space_updated', space: state.space })
        break
      }
      case 'tick': {
        game.applyUpdate({ tick: event.tick as never })
        break
      }
      case 'facility_built':
      case 'facility_updated':
        facilities.applyUpdate({ type: event.type, facility: event.facility as never })
        break
      case 'facility_demolished': {
        const id = event.facilityId as number
        const idx = facilities.list.findIndex(f => f.id === id)
        if (idx >= 0) facilities.list.splice(idx, 1)
        break
      }
      case 'transport_built':
        transports.applyUpdate({ type: event.type, transport: event.transport as never })
        break
      case 'transport_demolished': {
        const id = event.transportId as number
        const idx = transports.list.findIndex(t => t.id === id)
        if (idx >= 0) transports.list.splice(idx, 1)
        break
      }
      case 'resource_updated':
        resources.applyUpdate({ rows: event.rows as never })
        break
      case 'event_logged':
        events.applyUpdate({ type: event.type, event: event.event as never })
        break
      case 'action_logged':
        actions.applyUpdate({ type: event.type, action: event.action as never })
        break
      case 'research_updated':
        techtree.applyUpdate({ type: event.type, node: event.node as never })
        break
      case 'environment_updated':
        environment.applyUpdate({ type: event.type, environment: event.environment as never })
        break
      case 'terrain_modified':
        terrain.applyUpdate({ type: event.type, modification: event.modification as never })
        break
      case 'power_updated':
        power.applyUpdate({ type: event.type, power: event.power as never })
        break
      case 'space_updated':
        space.applyUpdate({ type: event.type, space: event.space as never })
        break
      case 'game_over':
        game.applyUpdate({ meta: event.meta as never })
        break
    }
  }

  function disconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer)
    if (source) {
      source.close()
      source = null
    }
    ui.connectionStatus = 'disconnected'
  }

  onUnmounted(disconnect)

  return { connect, disconnect }
}