<script setup lang="ts">
import { TechBranch, TechStatus } from '~/lib/types/tech';
import { useTechTreeStore } from '~/stores/techtree';

const techtree = useTechTreeStore();

function statusIcon(status: TechStatus): string {
  switch (status) {
    case TechStatus.Completed: return '✓';
    case TechStatus.InProgress: return '◐';
    case TechStatus.Available: return '○';
    case TechStatus.Locked: return '⊘';
    default: return '?';
  }
}

function branchColor(branch: TechBranch): string {
  switch (branch) {
    case TechBranch.Metallurgy: return 'text-amber-400';
    case TechBranch.Chemistry: return 'text-purple-400';
    case TechBranch.Power: return 'text-yellow-400';
    case TechBranch.Space: return 'text-cyan-300';
    case TechBranch.Terraforming: return 'text-orange-400';
    default: return 'text-cyan-500';
  }
}
</script>

<template>
  <div class="border border-cyan-900/50 bg-black/70 backdrop-blur-sm p-3">
    <h3 class="text-cyan-400 text-xs font-bold tracking-wider mb-2">
      TECH TREE
    </h3>
    <div class="space-y-0.5 max-h-64 overflow-y-auto">
      <div
        v-for="node in techtree.nodes"
        :key="node.id"
        class="flex items-center gap-2 text-xs py-0.5 px-1"
        :class="branchColor(node.category)"
      >
        <span>{{ statusIcon(node.status) }}</span>
        <span class="flex-1 truncate">{{ node.name }}</span>
        <span class="text-cyan-700 text-xs">T{{ node.tier }}</span>
      </div>
      <div v-if="techtree.nodes.length === 0" class="text-cyan-700 text-xs">
        No tech data.
      </div>
    </div>
  </div>
</template>
