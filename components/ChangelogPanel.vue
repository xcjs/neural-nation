<script setup lang="ts">
import type { ChangelogEntry } from '~/types/changelog';

defineProps<{
  data: ChangelogEntry[];
  open: boolean;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
}>();

function close() {
  emit('update:open', false);
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      leave-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
        @click.self="close"
      >
        <div class="max-w-2xl w-full max-h-[80vh] overflow-y-auto border border-cyan-700 bg-black p-6">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-cyan-400 font-bold tracking-wider text-lg">
              CHANGELOG
            </h2>
            <button
              class="text-cyan-600 hover:text-cyan-400 text-xl leading-none"
              @click="close"
            >
              ✕
            </button>
          </div>

          <div v-for="entry in data" :key="entry.version" class="mb-6 last:mb-0">
            <div class="flex items-baseline gap-2 mb-1">
              <span class="text-cyan-300 font-bold text-sm">v{{ entry.version }}</span>
              <span class="text-cyan-700 text-xs">{{ entry.date }}</span>
            </div>
            <p class="text-cyan-500 text-xs mb-2">
              {{ entry.summary }}
            </p>

            <div v-if="entry.changes.added" class="mb-1">
              <p class="text-green-500 text-xs font-bold mb-0.5">
                ADDED
              </p>
              <ul class="text-cyan-400 text-xs space-y-0.5 ml-4 list-disc">
                <li v-for="item in entry.changes.added" :key="item">
                  {{ item }}
                </li>
              </ul>
            </div>

            <div v-if="entry.changes.changed" class="mb-1">
              <p class="text-yellow-500 text-xs font-bold mb-0.5">
                CHANGED
              </p>
              <ul class="text-cyan-400 text-xs space-y-0.5 ml-4 list-disc">
                <li v-for="item in entry.changes.changed" :key="item">
                  {{ item }}
                </li>
              </ul>
            </div>

            <div v-if="entry.changes.fixed" class="mb-1">
              <p class="text-blue-400 text-xs font-bold mb-0.5">
                FIXED
              </p>
              <ul class="text-cyan-400 text-xs space-y-0.5 ml-4 list-disc">
                <li v-for="item in entry.changes.fixed" :key="item">
                  {{ item }}
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
