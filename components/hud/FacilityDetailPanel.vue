<script setup lang="ts">
import { computed } from 'vue';
import { useFacilitiesStore } from '~/stores/facilities';

const facilities = useFacilitiesStore();

const statusColor = computed(() => {
  const s = facilities.selected?.status;
  switch (s) {
    case 'Active': return 'text-green-400';
    case 'UnderConstruction': return 'text-amber-400';
    case 'Idle': return 'text-cyan-500';
    case 'Damaged': return 'text-orange-400';
    case 'Destroyed': return 'text-red-400';
    default: return 'text-cyan-500';
  }
});

const footprintSvg = computed(() => {
  const fp = facilities.selected?.footprint;
  if (!fp || fp.length < 3)
    return null;

  const lats = fp.map(p => p.lat);
  const lons = fp.map(p => p.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const latRange = maxLat - minLat || 0.0001;
  const lonRange = maxLon - minLon || 0.0001;

  const W = 120;
  const H = 120;
  const pad = 8;
  const scale = Math.min((W - pad * 2) / lonRange, (H - pad * 2) / latRange);

  const points = fp.map((p) => {
    const x = pad + (p.lon - minLon) * scale;
    const y = H - pad - (p.lat - minLat) * scale;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const pathStr = `M ${points.join(' L ')} Z`;

  const centroidLat = lats.reduce((a, b) => a + b, 0) / lats.length;
  const centroidLon = lons.reduce((a, b) => a + b, 0) / lons.length;
  const cx = pad + (centroidLon - minLon) * scale;
  const cy = H - pad - (centroidLat - minLat) * scale;

  let areaDeg2 = 0;
  for (let i = 0; i < fp.length; i++) {
    const j = (i + 1) % fp.length;
    areaDeg2 += fp[i]!.lon * fp[j]!.lat - fp[j]!.lon * fp[i]!.lat;
  }
  areaDeg2 = Math.abs(areaDeg2) / 2;
  const avgLat = (minLat + maxLat) / 2;
  const kmPerDegLat = 111;
  const kmPerDegLon = 111 * Math.cos(avgLat * Math.PI / 180);
  const areaKm2 = areaDeg2 * kmPerDegLat * kmPerDegLon;
  const areaM2 = areaKm2 * 1_000_000;
  const areaLabel = areaKm2 >= 0.01
    ? `${areaKm2.toFixed(areaKm2 >= 100 ? 0 : areaKm2 >= 1 ? 2 : 3)} km²`
    : `${areaM2.toFixed(0)} m²`;

  return { pathStr, cx, cy, W, H, areaKm2, areaLabel, vertexCount: fp.length };
});
</script>

<template>
  <div class="border border-cyan-900/50 bg-black/70 backdrop-blur-sm p-3">
    <h3 class="text-cyan-400 text-xs font-bold tracking-wider mb-2">
      FACILITY DETAIL
    </h3>
    <div v-if="!facilities.selected" class="text-cyan-700 text-xs">
      No facility selected.
    </div>
    <div v-else class="space-y-1 text-xs">
      <div class="text-cyan-200 font-bold text-sm mb-1">
        {{ facilities.selected.name }}
      </div>
      <div class="flex justify-between">
        <span class="text-cyan-700">Type:</span><span class="text-cyan-300">{{ facilities.selected.type }}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-cyan-700">Status:</span><span :class="statusColor">{{ facilities.selected.status }}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-cyan-700">Location:</span><span class="text-cyan-300">{{ facilities.selected.lat.toFixed(2) }}, {{ facilities.selected.lon.toFixed(2) }}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-cyan-700">Recipe:</span><span class="text-cyan-300">{{ facilities.selected.activeRecipeId || '—' }}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-cyan-700">Power:</span><span :class="facilities.selected.powerConnected ? 'text-green-400' : 'text-red-400'">{{ facilities.selected.powerConnected ? 'Connected' : 'Disconnected' }}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-cyan-700">Throughput:</span><span class="text-cyan-300">{{ facilities.selected.throughput.toFixed(1) }}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-cyan-700">Elevation:</span><span class="text-cyan-300">{{ facilities.selected.elevation.toFixed(0) }}m</span>
      </div>
      <div class="flex justify-between">
        <span class="text-cyan-700">Terrain:</span><span class="text-cyan-300">{{ facilities.selected.terrainClass }}</span>
      </div>
      <div v-if="footprintSvg" class="mt-2">
        <p class="text-cyan-500 font-bold mb-0.5">
          FOOTPRINT ({{ footprintSvg.vertexCount }} vertices)
        </p>
        <svg :width="footprintSvg.W" :height="footprintSvg.H" class="border border-cyan-900/50 bg-cyan-950/30">
          <path
            :d="footprintSvg.pathStr"
            fill="rgba(34,211,238,0.2)"
            stroke="#22d3ee"
            stroke-width="1.5"
          />
          <circle
            :cx="footprintSvg.cx"
            :cy="footprintSvg.cy"
            r="2"
            fill="#22d3ee"
          />
        </svg>
        <p class="text-cyan-700 text-[10px] mt-0.5">
          ~{{ footprintSvg.areaLabel }}
        </p>
      </div>
      <div v-if="facilities.selected.status === 'UnderConstruction'" class="mt-1">
        <div class="text-cyan-700 mb-0.5">
          Construction: {{ (facilities.selected.constructionProgress * 100).toFixed(0) }}%
        </div>
        <div class="w-full h-1 bg-cyan-950">
          <div class="h-1 bg-cyan-400" :style="{ width: `${facilities.selected.constructionProgress * 100}%` }" />
        </div>
      </div>
      <div v-if="facilities.selected.inputs.length > 0" class="mt-2">
        <p class="text-cyan-500 font-bold mb-0.5">
          INPUTS
        </p>
        <div v-for="buf in facilities.selected.inputs" :key="buf.resourceKey" class="flex justify-between">
          <span class="text-cyan-300">{{ buf.resourceKey }}</span>
          <span class="text-cyan-500">{{ buf.quantity.toFixed(1) }}/{{ buf.capacity }}{{ buf.unit }}</span>
        </div>
      </div>
      <div v-if="facilities.selected.outputs.length > 0" class="mt-1">
        <p class="text-cyan-500 font-bold mb-0.5">
          OUTPUTS
        </p>
        <div v-for="buf in facilities.selected.outputs" :key="buf.resourceKey" class="flex justify-between">
          <span class="text-cyan-300">{{ buf.resourceKey }}</span>
          <span class="text-cyan-500">{{ buf.quantity.toFixed(1) }}/{{ buf.capacity }}{{ buf.unit }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
