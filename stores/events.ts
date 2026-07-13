import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface EventLogEntry {
  id: number;
  tick: number;
  timestamp: string;
  type: string;
  message: string;
  severity: string;
  facilityId: number | null;
  data: string | null;
}

const MAX_EVENTS = 50;

export const useEventsStore = defineStore('events', () => {
  const items = ref<EventLogEntry[]>([]);

  function applyUpdate(patch: { type: string; event?: EventLogEntry }) {
    if (patch.type === 'event_logged' && patch.event) {
      items.value.unshift(patch.event);
      if (items.value.length > MAX_EVENTS)
        items.value = items.value.slice(0, MAX_EVENTS);
    }
  }

  function reset() {
    items.value = [];
  }

  return { items, applyUpdate, reset };
});
