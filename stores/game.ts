import { defineStore } from 'pinia'
import { ref } from 'vue'
import { $fetch } from 'ofetch'
import { GameStatus, type GameMeta, type TickState, type FullGameState } from '~/lib/types/game'

export const useGameStore = defineStore('game', () => {
  const meta = ref<GameMeta | null>(null)
  const tick = ref<TickState>({ tickCount: 0, status: GameStatus.Active, lastTickAt: null })
  const loading = ref(false)
  const error = ref('')

  async function fetchState(token: string) {
    loading.value = true
    error.value = ''
    try {
      const res = await $fetch<FullGameState>(`/api/game-state?token=${token}`)
      meta.value = res.meta
      tick.value = res.tick
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load game state'
    } finally {
      loading.value = false
    }
  }

  function applyUpdate(patch: Partial<FullGameState>) {
    if (patch.meta) meta.value = patch.meta
    if (patch.tick) tick.value = patch.tick
  }

  function reset() {
    meta.value = null
    tick.value = { tickCount: 0, status: GameStatus.Active, lastTickAt: null }
    loading.value = false
    error.value = ''
  }

  return { meta, tick, loading, error, fetchState, applyUpdate, reset }
})