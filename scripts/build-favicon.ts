import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { feature } from 'topojson-client';
import data from 'world-atlas/land-50m.json';

const topoData = data as unknown as { objects: Record<string, unknown> };

// Convert to GeoJSON FeatureCollection (continental land-mass, no country borders)
const fc = feature(topoData as never, topoData.objects.land as never) as unknown as GeoJSON.FeatureCollection;

// Orthographic projection centered on [lat=15, lon=20] so Africa/Europe face viewer
const CENTER_LAT = 15;
const CENTER_LON = 20;
const RADIUS = 30;
const CX = 32;
const CY = 32;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function project(lon: number, lat: number): [number, number] {
  const phi = toRad(lat);
  const lam = toRad(lon - CENTER_LON);
  const phi0 = toRad(CENTER_LAT);
  const lam0 = toRad(0);

  const cosC = Math.sin(phi0) * Math.sin(phi) + Math.cos(phi0) * Math.cos(phi) * Math.cos(lam - lam0);

  let x: number;
  let y: number;
  if (cosC > 1 - 1e-9) {
    x = 0;
    y = 0;
  }
  else {
    x = Math.cos(phi) * Math.sin(lam - lam0);
    y = Math.cos(phi0) * Math.sin(phi) - Math.sin(phi0) * Math.cos(phi) * Math.cos(lam - lam0);
  }

  // Clamp back-side points to horizon circle
  if (cosC < 0) {
    const len = Math.sqrt(x * x + y * y);
    if (len > 0) {
      x = (x / len) * 0.97;
      y = (y / len) * 0.97;
    }
  }

  return [CX + x * RADIUS, CY - y * RADIUS];
}

// Simplify a polygon by keeping every Nth point (decimation)
function projectRing(ring: GeoJSON.Position[]): string {
  let path = '';
  const step = Math.max(2, Math.floor(ring.length / 500)); // target ~500 points per ring
  for (let i = 0; i < ring.length; i += step) {
    const pt = ring[i];
    if (!pt)
      continue;
    const [lon, lat] = pt;
    const [px, py] = project(lon!, lat!);
    path += `${path === '' ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)} `;
  }
  // Close to first point
  if (ring.length > 0) {
    const first = ring[0];
    if (first) {
      const [lon, lat] = first;
      const [px, py] = project(lon!, lat!);
      path += `L ${px.toFixed(1)} ${py.toFixed(1)} `;
    }
  }
  return `${path}Z`;
}

function projectGeometry(geom: GeoJSON.Geometry): string {
  if (geom.type === 'Polygon') {
    const outer = geom.coordinates[0];
    if (!outer || outer.length < 200)
      return ''; // only major landmasses
    return projectRing(outer);
  }
  else if (geom.type === 'MultiPolygon') {
    const parts = geom.coordinates
      .filter(poly => poly[0]?.length ?? 0 >= 200)
      .map(poly => poly[0] ? projectRing(poly[0]) : '');
    return parts.join(' ');
  }
  return '';
}

// Project all features
const paths: string[] = [];
for (const feat of fc.features) {
  const p = projectGeometry(feat.geometry);
  if (p && p.length > 10)
    paths.push(p);
}

const landPaths = paths.map(p => `      <path d="${p}" />`).join('\n');

// Neural-network nodes at continent interior locations (lat, lon)
const nodes: Array<[number, number]> = [
  [10, 20], // Central Africa
  [50, 10], // Central Europe
  [45, 90], // Central Asia
  [25, 80], // India
  [35, 105], // East China
  [-20, 135], // Australia
];
const nodePts = nodes.map(([lat, lon]) => project(lon, lat));

// Edges connecting nearby nodes
const edges: Array<[number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [2, 4],
  [3, 4],
  [0, 3],
  [4, 5],
  [0, 5],
];
const edgePaths = edges.map(([a, b]) => {
  const p1 = nodePts[a];
  const p2 = nodePts[b];
  if (!p1 || !p2)
    return '';
  const [x1, y1] = p1;
  const [x2, y2] = p2;
  return `        <path d="M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}" />`;
}).join('\n');
const nodeCircles = nodePts.map(([x, y]) => `        <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="0.8" />`).join('\n');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <radialGradient id="ocean" cx="38%" cy="34%" r="75%">
      <stop offset="0%" stop-color="#0a3a5c" />
      <stop offset="55%" stop-color="#062a44" />
      <stop offset="100%" stop-color="#021628" />
    </radialGradient>
    <linearGradient id="landN" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1ea578" />
      <stop offset="100%" stop-color="#0d6b4a" />
    </linearGradient>
    <clipPath id="globe">
      <circle cx="32" cy="32" r="30" />
    </clipPath>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="0.8" result="b" />
      <feMerge>
        <feMergeNode in="b" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>

  <circle cx="32" cy="32" r="30" fill="url(#ocean)" stroke="#22d3ee" stroke-width="0.6" stroke-opacity="0.7" />

  <g clip-path="url(#globe)">
    <g fill="url(#landN)" opacity="0.92">
${landPaths}
    </g>

    <g stroke="#22d3ee" stroke-width="0.5" fill="#22d3ee" filter="url(#glow)" opacity="0.9">
      <g fill="none">
${edgePaths}
      </g>
      <g>
${nodeCircles}
      </g>
    </g>
    </g>
</svg>`;

const outPath = process.argv[2] ?? resolve('public', 'favicon.svg');
writeFileSync(outPath, svg, 'utf8');
console.log(`Wrote ${svg.length} chars, ${paths.length} land paths to ${outPath}`);
