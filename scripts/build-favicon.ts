import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { feature } from 'topojson-client';
import data from 'world-atlas/land-50m.json';

const topoData = data as unknown as { objects: Record<string, unknown>; arcs: unknown[]; transform: unknown };

// Convert to GeoJSON FeatureCollection (continental land-mass, no country borders)
const fc = feature(topoData, topoData.objects.land as never) as unknown as GeoJSON.FeatureCollection;

// Orthographic projection centered on [lat=15, lon=20] so Africa/Europe face viewer
const CENTER_LAT = 15;
const CENTER_LON = 20;
const RADIUS = 24;
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
    const [lon, lat] = ring[i];
    const [px, py] = project(lon, lat);
    path += (path === '' ? 'M' : 'L') + ` ${px.toFixed(1)} ${py.toFixed(1)} `;
  }
  // Close to first point
  if (ring.length > 0) {
    const [lon, lat] = ring[0];
    const [px, py] = project(lon, lat);
    path += `L ${px.toFixed(1)} ${py.toFixed(1)} `;
  }
  return path + 'Z';
}

function projectGeometry(geom: GeoJSON.Geometry): string {
  if (geom.type === 'Polygon') {
    if (geom.coordinates[0].length < 200) return ''; // only major landmasses
    return projectRing(geom.coordinates[0]);
  }
  else if (geom.type === 'MultiPolygon') {
    const parts = geom.coordinates
      .filter(poly => poly[0].length >= 200)
      .map(poly => projectRing(poly[0]));
    return parts.join(' ');
  }
  return '';
}

// Project all features
const paths: string[] = [];
for (const feat of fc.features) {
  const p = projectGeometry(feat.geometry);
  if (p && p.length > 10) paths.push(p);
}

const landPaths = paths.map(p => `      <path d="${p}" />`).join('\n');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <radialGradient id="ocean" cx="38%" cy="34%" r="75%">
      <stop offset="0%" stop-color="#0a3a5c" />
      <stop offset="55%" stop-color="#062a44" />
      <stop offset="100%" stop-color="#021628" />
    </radialGradient>
    <radialGradient id="atmo" cx="50%" cy="50%" r="55%">
      <stop offset="78%" stop-color="#22d3ee" stop-opacity="0" />
      <stop offset="92%" stop-color="#22d3ee" stop-opacity="0.45" />
      <stop offset="100%" stop-color="#22d3ee" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="landN" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1ea578" />
      <stop offset="100%" stop-color="#0d6b4a" />
    </linearGradient>
    <clipPath id="globe">
      <circle cx="32" cy="32" r="24" />
    </clipPath>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="0.8" result="b" />
      <feMerge>
        <feMergeNode in="b" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>

  <circle cx="32" cy="32" r="30" fill="url(#atmo)" />
  <circle cx="32" cy="32" r="24" fill="url(#ocean)" stroke="#22d3ee" stroke-width="0.6" stroke-opacity="0.7" />

  <g clip-path="url(#globe)">
    <g fill="url(#landN)" opacity="0.92">
${landPaths}
    </g>

    <g stroke="#22d3ee" stroke-width="0.9" fill="#22d3ee" filter="url(#glow)" opacity="0.95">
      <g fill="none">
        <path d="M 19 23 L 31 21" />
        <path d="M 31 21 L 46 20" />
        <path d="M 46 20 L 50 43" />
        <path d="M 50 43 L 31 43" />
        <path d="M 31 43 L 19 23" />
        <path d="M 31 21 L 31 43" />
        <path d="M 19 23 L 50 43" />
      </g>
      <g>
        <circle cx="19" cy="23" r="1.4" />
        <circle cx="31" cy="21" r="1.5" />
        <circle cx="46" cy="20" r="1.4" />
        <circle cx="50" cy="43" r="1.3" />
        <circle cx="31" cy="43" r="1.2" />
      </g>
    </g>
  </g>

  <ellipse cx="32" cy="32" rx="24" ry="6.5" fill="none" stroke="#22d3ee" stroke-width="0.4" stroke-opacity="0.3" />
</svg>`;

const outPath = process.argv[2] ?? resolve('public', 'favicon.svg');
writeFileSync(outPath, svg, 'utf8');
console.log(`Wrote ${svg.length} chars, ${paths.length} land paths to ${outPath}`);