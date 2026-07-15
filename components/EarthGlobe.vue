<script setup lang="ts">
import type { FacilitySummary } from '~/lib/types/facility';
import type { TerrainModification } from '~/lib/types/terrain';
import type { TransportSummary } from '~/lib/types/transport';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { feature } from 'topojson-client';
import { onMounted, onUnmounted, ref, watch } from 'vue';
import landTopo from 'world-atlas/land-110m.json';

const props = defineProps<{
  facilities: FacilitySummary[];
  transports: TransportSummary[];
  quality: 'low' | 'medium' | 'high';
  terrainModifications?: TerrainModification[];
  pollutionLevel?: number;
  forestCoverage?: number;
  biodiversity?: number;
  waterQuality?: number;
  showPollutionMap?: boolean;
  token?: string;
}>();

const emit = defineEmits<{
  (e: 'facilityClick', facilityId: number): void;
  (e: 'facilityHover', facilityId: number | null): void;
}>();

const container = ref<HTMLDivElement | null>(null);
const hoverTooltip = ref<{ x: number; y: number; name: string; type: string; status: string } | null>(null);
let renderer: THREE.WebGLRenderer;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let controls: OrbitControls;
let raycaster: THREE.Raycaster;
let pointer: THREE.Vector2;
let animationId: number;
let earthMesh: THREE.Mesh;
let wireframeMesh: THREE.LineSegments;
let atmosphereMesh: THREE.Mesh;
let coastlineGroup: THREE.Group;
let markerGroup: THREE.Group;
let transportGroup: THREE.Group;
let transportParticles: THREE.Points | null = null;
let transportUniforms: { uTime: { value: number } } | null = null;
let terrainModGroup: THREE.Group;
let composer: EffectComposer | null = null;
let bloomPass: UnrealBloomPass | null = null;
let pollutionMesh: THREE.Mesh | null = null;
let pollutionMaterial: THREE.MeshBasicMaterial | null = null;
let pollutionTexture: THREE.DataTexture | null = null;
let forestMesh: THREE.Mesh | null = null;
let forestMaterial: THREE.MeshBasicMaterial | null = null;
let forestTexture: THREE.DataTexture | null = null;

const EARTH_RADIUS = 1;

function latLonToVec3(lat: number, lon: number, r: number = EARTH_RADIUS): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  );
}

function buildCoastlines(): THREE.Group {
  const group = new THREE.Group();
  const lineMat = new THREE.LineBasicMaterial({
    color: 0x00AAFF,
    transparent: true,
    opacity: 0.5,
  });

  // Convert TopoJSON to GeoJSON FeatureCollection
  const geojson = feature(landTopo as never, (landTopo as never as { objects: { land: unknown } }).objects.land as never) as unknown as { type: string; features: Array<{ geometry: { type: string; coordinates: number[][] | number[][][] } }> };

  for (const feat of geojson.features) {
    const geom = feat.geometry;
    if (geom.type === 'Polygon') {
      for (const ring of geom.coordinates as number[][][]) {
        addRing(group, ring, lineMat);
      }
    }
    else if (geom.type === 'MultiPolygon') {
      for (const polygon of geom.coordinates as unknown as number[][][][]) {
        for (const ring of polygon) {
          addRing(group, ring, lineMat);
        }
      }
    }
  }

  return group;
}

function addRing(group: THREE.Group, ring: number[][], mat: THREE.LineBasicMaterial): void {
  const points: THREE.Vector3[] = [];
  for (const [lon, lat] of ring) {
    points.push(latLonToVec3(lat!, lon!, EARTH_RADIUS * 1.002));
  }
  if (points.length < 2)
    return;
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.Line(geo, mat);
  group.add(line);
}

function init() {
  if (!container.value)
    return;
  const w = container.value.clientWidth;
  const h = container.value.clientHeight;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 100);
  camera.position.set(0, 0, 2.8);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.value.appendChild(renderer.domElement);

  // Orbit controls — drag to rotate, scroll to zoom, touch supported
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.5;
  controls.minDistance = 1.2;
  controls.maxDistance = 8;
  controls.enablePan = false;

  // Raycaster for facility click detection
  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointermove', onPointerMove);

  // Earth sphere — wireframe/holographic style
  const geometry = new THREE.IcosahedronGeometry(EARTH_RADIUS, 6);
  const material = new THREE.MeshBasicMaterial({
    color: 0x002233,
    transparent: true,
    opacity: 0.6,
  });
  earthMesh = new THREE.Mesh(geometry, material);
  scene.add(earthMesh);

  // Wireframe overlay
  const wireGeo = new THREE.WireframeGeometry(geometry);
  const wireMat = new THREE.LineBasicMaterial({
    color: 0x00CCFF,
    transparent: true,
    opacity: 0.15,
  });
  wireframeMesh = new THREE.LineSegments(wireGeo, wireMat);
  scene.add(wireframeMesh);

  // Continent coastlines from real GeoJSON data
  coastlineGroup = buildCoastlines();
  scene.add(coastlineGroup);

  // Environment overlay: forest (green land fills), water (blue ocean), pollution (brown haze)
  buildEnvironmentOverlay();

  // Atmosphere glow (fresnel effect)
  const atmoGeo = new THREE.IcosahedronGeometry(EARTH_RADIUS * 1.05, 4);
  const atmoMat = new THREE.ShaderMaterial({
    vertexShader: `
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vNormal;
      void main() {
        float intensity = pow(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
        gl_FragColor = vec4(0.0, 0.6, 1.0, 1.0) * intensity;
      }
    `,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    transparent: true,
  });
  atmosphereMesh = new THREE.Mesh(atmoGeo, atmoMat);
  scene.add(atmosphereMesh);

  // Marker groups
  markerGroup = new THREE.Group();
  scene.add(markerGroup);
  transportGroup = new THREE.Group();
  scene.add(transportGroup);
  terrainModGroup = new THREE.Group();
  scene.add(terrainModGroup);

  // Bloom post-processing (only for medium/high quality)
  if (props.quality !== 'low') {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(w, h),
      props.quality === 'high' ? 0.6 : 0.4, // strength
      0.3, // radius
      0.6, // threshold — only bloom bright elements (markers, arcs), not forests
    );
    composer.addPass(bloomPass);
  }

  animate();
}

function buildEnvironmentOverlay(): void {
  // --- Forest: climate-data-driven DataTexture (Köppen-Geiger forest density) ---
  if (forestMesh) {
    scene.remove(forestMesh);
    forestMesh.geometry.dispose();
    forestMaterial?.dispose();
    forestTexture?.dispose();
  }

  // Fetch forest density data (pre-built from Köppen-Geiger climate classification)
  fetch('/data/geological/forest-density.json')
    .then(res => res.json() as Promise<{ width: number; height: number; data: number[] }>)
    .then((result) => {
      const { width: tw, height: th, data } = result;
      // Convert density values (0-1) to RGBA pixel data, flipping Y (row 0=lat 90 → bottom of texture)
      const rgba = new Uint8Array(tw * th * 4);
      for (let y = 0; y < th; y++) {
        for (let x = 0; x < tw; x++) {
          const srcIdx = y * tw + x;
          const dstIdx = (th - 1 - y) * tw + x;
          const d = data[srcIdx]!;
          if (d <= 0) {
            rgba[dstIdx * 4] = 0;
            rgba[dstIdx * 4 + 1] = 0;
            rgba[dstIdx * 4 + 2] = 0;
            rgba[dstIdx * 4 + 3] = 0;
          }
          else {
            rgba[dstIdx * 4] = Math.round(20 + (1 - d) * 40); // R
            rgba[dstIdx * 4 + 1] = Math.round(80 + d * 120); // G
            rgba[dstIdx * 4 + 2] = Math.round(20 + d * 30); // B
            rgba[dstIdx * 4 + 3] = Math.round(d * 180); // A
          }
        }
      }

      forestTexture = new THREE.DataTexture(rgba, tw, th, THREE.RGBAFormat);
      forestTexture.flipY = false;
      forestTexture.unpackAlignment = 1;
      forestTexture.needsUpdate = true;
      forestTexture.wrapS = THREE.RepeatWrapping;
      forestTexture.wrapT = THREE.ClampToEdgeWrapping;

      // Sphere at r=1.001 (below coastlines at 1.002)
      const forestGeo = new THREE.SphereGeometry(EARTH_RADIUS * 1.001, 720, 360);
      forestMaterial = new THREE.MeshBasicMaterial({
        map: forestTexture,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
      });
      forestMesh = new THREE.Mesh(forestGeo, forestMaterial);
      forestMesh.rotation.y = earthMesh.rotation.y;
      scene.add(forestMesh);
    })
    .catch(() => {
      // Forest density data not available — skip forest overlay
    });

  // Fetch per-game forest grid (location-specific depletion)
  if (props.token) {
    updateForestGrid();
  }

  // --- Pollution: per-cell brown DataTexture grid overlay (same as forest) ---
  if (pollutionMesh) {
    scene.remove(pollutionMesh);
    pollutionMesh.geometry.dispose();
    pollutionMaterial?.dispose();
    pollutionTexture?.dispose();
  }
  {
    const pw = 720;
    const ph = 360;
    const rgba = new Uint8Array(pw * ph * 4); // all zeros = transparent
    pollutionTexture = new THREE.DataTexture(rgba, pw, ph, THREE.RGBAFormat);
    pollutionTexture.flipY = false;
    pollutionTexture.unpackAlignment = 1;
    pollutionTexture.needsUpdate = true;
    pollutionTexture.wrapS = THREE.RepeatWrapping;
    pollutionTexture.wrapT = THREE.ClampToEdgeWrapping;

    const pollutionGeo = new THREE.SphereGeometry(EARTH_RADIUS * 1.0015, 720, 360);
    pollutionMaterial = new THREE.MeshBasicMaterial({
      map: pollutionTexture,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    });
    pollutionMesh = new THREE.Mesh(pollutionGeo, pollutionMaterial);
    pollutionMesh.rotation.y = earthMesh.rotation.y;
    pollutionMesh.visible = props.showPollutionMap ?? false;
    scene.add(pollutionMesh);
  }

  if (props.token) {
    updatePollutionGrid();
  }

  // --- Water: earth base sphere IS the ocean ---
  updateEarthTint();
}

const FOREST_TEX_W = 720;
const FOREST_TEX_H = 360;

async function updateForestGrid(): Promise<void> {
  if (!props.token || !forestTexture)
    return;
  try {
    const res = await fetch(`/api/game/forest-grid?token=${props.token}&minDensity=0.01`);
    const data = await res.json() as { cells: [number, number, number][] };
    // Rebuild texture from grid cells
    const rgba = forestTexture.image.data as Uint8Array;
    rgba.fill(0);
    for (const [latIdx, lonIdx, density] of data.cells) {
      const x = lonIdx;
      const dstY = FOREST_TEX_H - 1 - latIdx;
      if (x < 0 || x >= FOREST_TEX_W || dstY < 0 || dstY >= FOREST_TEX_H)
        continue;
      const i = dstY * FOREST_TEX_W + x;
      const d = Math.max(0, Math.min(1, density));
      rgba[i * 4] = Math.round(20 + (1 - d) * 40);
      rgba[i * 4 + 1] = Math.round(80 + d * 120);
      rgba[i * 4 + 2] = Math.round(20 + d * 30);
      rgba[i * 4 + 3] = Math.round(d * 180);
    }
    forestTexture.needsUpdate = true;
  }
  catch {
    // API not available — keep static texture
  }
}

const POLLUTION_TEX_W = 720;
const POLLUTION_TEX_H = 360;

async function updatePollutionGrid(): Promise<void> {
  if (!props.token || !pollutionTexture)
    return;
  try {
    const res = await fetch(`/api/game/pollution-grid?token=${props.token}&minPollution=0.1`);
    const data = await res.json() as { cells: [number, number, number][] };
    const rgba = pollutionTexture.image.data as Uint8Array;
    rgba.fill(0);
    for (const [latIdx, lonIdx, pollution] of data.cells) {
      const x = lonIdx;
      const dstY = POLLUTION_TEX_H - 1 - latIdx;
      if (x < 0 || x >= POLLUTION_TEX_W || dstY < 0 || dstY >= POLLUTION_TEX_H)
        continue;
      const i = dstY * POLLUTION_TEX_W + x;
      const p = Math.max(0, Math.min(1, pollution / 100));
      rgba[i * 4] = Math.round(80 + p * 60); // R — brown
      rgba[i * 4 + 1] = Math.round(50 + p * 20); // G
      rgba[i * 4 + 2] = Math.round(20 + p * 10); // B
      rgba[i * 4 + 3] = Math.round(p * 150); // A
    }
    pollutionTexture.needsUpdate = true;
  }
  catch {
    // API not available — keep transparent
  }
}

function updateEarthTint(): void {
  const mat = earthMesh.material as THREE.MeshBasicMaterial;
  mat.color.setRGB(0.0, 0.13, 0.2);
}

function onPointerDown(event: PointerEvent) {
  if (!container.value)
    return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  // Only raycast against invisible hit cylinders (not footprints/lines)
  const meshes: THREE.Object3D[] = [];
  markerGroup.children.forEach((child) => {
    if (child.type === 'Mesh') {
      const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
      if (mat.opacity === 0)
        meshes.push(child);
    }
  });

  const intersects = raycaster.intersectObjects(meshes, false);
  if (intersects.length > 0) {
    const facilityId = intersects[0]!.object.userData.facilityId as number | undefined;
    if (facilityId !== undefined) {
      emit('facilityClick', facilityId);
    }
  }
}

function onPointerMove(event: PointerEvent) {
  if (!container.value || !renderer) {
    hoverTooltip.value = null;
    return;
  }
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const meshes: THREE.Object3D[] = [];
  markerGroup.children.forEach((child) => {
    if (child.type === 'Mesh') {
      const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
      if (mat.opacity === 0)
        meshes.push(child);
    }
  });

  const intersects = raycaster.intersectObjects(meshes, false);
  if (intersects.length > 0) {
    const facilityId = intersects[0]!.object.userData.facilityId as number | undefined;
    if (facilityId !== undefined) {
      const f = props.facilities.find(fac => fac.id === facilityId);
      if (f) {
        hoverTooltip.value = {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
          name: f.name,
          type: f.type,
          status: f.status,
        };
        emit('facilityHover', facilityId);
        return;
      }
    }
  }
  if (hoverTooltip.value !== null) {
    hoverTooltip.value = null;
    emit('facilityHover', null);
  }
}

function buildFootprintPolygon(footprint: Array<{ lat: number; lon: number }>, color: number): THREE.Group {
  const group = new THREE.Group();
  if (footprint.length < 3)
    return group;
  const r = EARTH_RADIUS * 1.002;
  const points3d = footprint.map(p => latLonToVec3(p.lat, p.lon, r));
  const centroid = new THREE.Vector3();
  points3d.forEach(p => centroid.add(p));
  centroid.divideScalar(points3d.length);
  const positions: number[] = [];
  for (let i = 0; i < points3d.length; i++) {
    const a = points3d[i]!;
    const b = points3d[(i + 1) % points3d.length]!;
    positions.push(centroid.x, centroid.y, centroid.z);
    positions.push(a.x, a.y, a.z);
    positions.push(b.x, b.y, b.z);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const mesh = new THREE.Mesh(geo, mat);
  group.add(mesh);
  const outlineGeo = new THREE.BufferGeometry();
  const outlinePoints: number[] = [];
  for (let i = 0; i <= points3d.length; i++) {
    const p = points3d[i % points3d.length]!;
    outlinePoints.push(p.x, p.y, p.z);
  }
  outlineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(outlinePoints), 3));
  const outlineMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending });
  const outline = new THREE.Line(outlineGeo, outlineMat);
  group.add(outline);
  return group;
}

function updateMarkers() {
  if (!markerGroup || !transportGroup || !terrainModGroup)
    return;
  while (markerGroup.children.length > 0) markerGroup.remove(markerGroup.children[0]!);
  while (transportGroup.children.length > 0) transportGroup.remove(transportGroup.children[0]!);
  transportParticles = null;
  transportUniforms = null;

  const markerColors: Record<string, number> = {
    Extractor: 0xFF8800,
    Farm: 0x44FF44,
    Forestry: 0x22AA22,
    WaterPump: 0x4488FF,
    Processor: 0xFF4400,
    Smelter: 0xFF6600,
    Refinery: 0xFF8800,
    ChemicalPlant: 0xFFAA00,
    Factory: 0xFF44FF,
    AdvancedFactory: 0xAA00FF,
    ResearchLab: 0xFF00FF,
    PowerPlant: 0xFFFF00,
    SolarFarm: 0xFFFF00,
    WindFarm: 0x00FFFF,
    HydroPlant: 0x0088FF,
    NuclearReactor: 0xFF8800,
    BreederReactor: 0xFF6600,
    FusionReactor: 0xAAFFFF,
    BiomassPlant: 0x44AA00,
    BiogasPlant: 0x66AA00,
    EthanolRefinery: 0x88AA00,
    SoylentPlant: 0xAA0033,
    DieselGenerator: 0x888888,
    CoalPlant: 0x666666,
    GasPlant: 0x888888,
    OilPlant: 0x666688,
    GeothermalPlant: 0xFF4422,
    Storage: 0x00AAFF,
    BatteryBank: 0x00AAFF,
    Spaceport: 0x00FFFF,
    RocketAssembly: 0x00CCFF,
    SpaceStation: 0xFFFFFF,
    OrbitalRefinery: 0xAACCFF,
    LunarMine: 0xDDCCAA,
    DeepSpaceProbe: 0xAAAAFF,
    SpaceHabitat: 0xFFFFFF,
    Excavator: 0xCC8844,
    Dredger: 0xCC8844,
    Terraformer: 0xCC6622,
    PlanetaryEngine: 0xFF4400,
  };

  // Build marker meshes
  for (const f of props.facilities) {
    const surfacePos = latLonToVec3(f.lat, f.lon, EARTH_RADIUS);
    const topPos = latLonToVec3(f.lat, f.lon, EARTH_RADIUS * 1.04);

    const color = markerColors[f.type] ?? 0x00FFFF;
    const isActive = f.status === 'Active';

    // Vertical line marker from surface upward
    const lineGeo = new THREE.BufferGeometry().setFromPoints([surfacePos, topPos]);
    const lineMat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: isActive ? 0.9 : 0.4,
    });
    const line = new THREE.Line(lineGeo, lineMat);
    line.userData.facilityId = f.id;
    markerGroup.add(line);

    // Invisible larger cylinder for easier raycasting
    const hitGeo = new THREE.CylinderGeometry(0.008, 0.008, EARTH_RADIUS * 0.04, 6, 1, true);
    const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    const hitMesh = new THREE.Mesh(hitGeo, hitMat);
    hitMesh.position.copy(topPos);
    hitMesh.lookAt(0, 0, 0);
    hitMesh.userData.facilityId = f.id;
    markerGroup.add(hitMesh);

    // Footprint polygon (if facility has one)
    if (f.footprint && f.footprint.length >= 3) {
      const fpGroup = buildFootprintPolygon(f.footprint, color);
      fpGroup.children.forEach((child) => {
        child.userData.facilityId = f.id;
      });
      markerGroup.add(fpGroup);
    }
  }

  // Transport arcs + flow particles
  const arcData: { points: THREE.Vector3[]; color: number; active: boolean }[] = [];
  for (const t of props.transports) {
    const fromPos = latLonToVec3(t.fromLat, t.fromLon, EARTH_RADIUS * 1.02);
    const toPos = latLonToVec3(t.toLat, t.toLon, EARTH_RADIUS * 1.02);
    const midPoint = new THREE.Vector3().addVectors(fromPos, toPos).multiplyScalar(0.5);
    midPoint.normalize().multiplyScalar(EARTH_RADIUS * 1.15);
    const curve = new THREE.QuadraticBezierCurve3(fromPos, midPoint, toPos);
    const points = curve.getPoints(30);
    const arcGeo = new THREE.BufferGeometry().setFromPoints(points);
    const flowRate = (t as { flowRate?: number }).flowRate;
    const isActive = flowRate != null && flowRate > 0;
    const arcColor = (t as { resourceKey?: string }).resourceKey ? 0x00FFFF : 0x446688;
    const arcMat = new THREE.LineBasicMaterial({
      color: arcColor,
      transparent: true,
      opacity: isActive ? 0.6 : 0.2,
    });
    transportGroup.add(new THREE.Line(arcGeo, arcMat));
    if (isActive) {
      arcData.push({ points, color: arcColor, active: true });
    }
  }

  if (arcData.length > 0) {
    buildTransportParticles(arcData);
  }

  // Terrain modification markers
  while (terrainModGroup.children.length > 0) terrainModGroup.remove(terrainModGroup.children[0]!);
  if (props.terrainModifications && props.terrainModifications.length > 0) {
    const modColors: Record<string, number> = {
      flatten_terrain: 0xCC8844,
      dig_canal: 0x4488FF,
      build_road_embankment: 0x886644,
      create_reservoir: 0x44AAFF,
      drain_area: 0xAA8844,
      divert_river: 0x44AAFF,
      level_mountain: 0xCC6622,
      raise_land: 0xCC8844,
      excavate_mine_shaft: 0x884422,
      create_mountain: 0xAA4422,
      shift_continental_plate: 0xFF4400,
      ocean_to_land: 0xCC8844,
      land_to_ocean: 0x4488FF,
    };
    for (const mod of props.terrainModifications) {
      const pos = latLonToVec3(mod.latIndex, mod.lonIndex, EARTH_RADIUS * 1.03);
      const color = modColors[mod.reason] ?? 0xFF8800;
      const raiseAmt = mod.elevationDelta > 0 ? 1 : 0;
      const size = 0.015 + Math.min(Math.abs(mod.elevationDelta) / 5000, 1) * 0.02;
      const ringGeo = new THREE.RingGeometry(size, size * 1.5, 16);
      const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.copy(pos);
      ring.lookAt(0, 0, 0);
      terrainModGroup.add(ring);

      // Vertical indicator: upward spike for raise, downward for lower
      const spikeDir = raiseAmt ? 1 : -1;
      const spikeGeo = new THREE.ConeGeometry(0.005, size * 2, 8);
      const spikeMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 });
      const spike = new THREE.Mesh(spikeGeo, spikeMat);
      spike.position.copy(pos);
      spike.lookAt(pos.clone().multiplyScalar(2));
      spike.rotateX(spikeDir * Math.PI / 2);
      spike.position.add(pos.clone().normalize().multiplyScalar(spikeDir * size));
      terrainModGroup.add(spike);

      // Patch coastlines for ocean↔land transitions
      if (mod.reason === 'ocean_to_land' || mod.reason === 'land_to_ocean') {
        patchCoastline(mod.latIndex, mod.lonIndex, mod.reason === 'ocean_to_land');
      }
    }
  }
}

function patchCoastline(lat: number, lon: number, toLand: boolean): void {
  // Build a small filled cell patch at this location to visually reshape the coastline.
  // Cell size matches the terrain grid resolution (~1°).
  const halfCell = 0.5;
  const corners: [number, number][] = [
    [lat - halfCell, lon - halfCell],
    [lat + halfCell, lon - halfCell],
    [lat + halfCell, lon + halfCell],
    [lat - halfCell, lon + halfCell],
  ];
  const points = corners.map(([la, lo]) => latLonToVec3(la, lo, EARTH_RADIUS * 1.001));
  // Close the loop
  points.push(points[0]!);

  if (toLand) {
    // Add a filled land patch (cyan outline + semi-transparent fill)
    const fillMat = new THREE.MeshBasicMaterial({
      color: 0x00AAFF,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
    });
    const shape = buildShape(points);
    const fillGeo = new THREE.ShapeGeometry(shape);
    const fill = new THREE.Mesh(fillGeo, fillMat);
    positionOnSphere(fill, points[0]!);
    coastlineGroup.add(fill);

    // Outline matching existing coastlines
    const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x00AAFF, transparent: true, opacity: 0.5 });
    coastlineGroup.add(new THREE.Line(lineGeo, lineMat));
  }
  else {
    // Land to ocean: overlay a dark blue water patch that obscures the existing coastline
    const fillMat = new THREE.MeshBasicMaterial({
      color: 0x002233,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
    });
    const shape = buildShape(points);
    const fillGeo = new THREE.ShapeGeometry(shape);
    const fill = new THREE.Mesh(fillGeo, fillMat);
    positionOnSphere(fill, points[0]!);
    coastlineGroup.add(fill);

    // Blue outline to indicate new water boundary
    const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x4488FF, transparent: true, opacity: 0.4 });
    coastlineGroup.add(new THREE.Line(lineGeo, lineMat));
  }
}

function positionOnSphere(mesh: THREE.Mesh, anchor: THREE.Vector3): void {
  mesh.position.copy(anchor);
  mesh.lookAt(0, 0, 0);
  // ShapeGeometry is in XY plane; lookAt orients Z toward center, so XY faces outward
  mesh.rotateX(Math.PI); // flip so the shape faces outward
}

function buildShape(points: THREE.Vector3[]): THREE.Shape {
  const shape = new THREE.Shape();
  // Project 3D points onto a 2D plane (tangent to sphere at cell center) for ShapeGeometry
  // Use the first point's normal as the plane basis
  const normal = points[0]!.clone().normalize();
  const up = new THREE.Vector3(0, 1, 0);
  let tangent = new THREE.Vector3().crossVectors(normal, up);
  if (tangent.lengthSq() < 0.01)
    tangent = new THREE.Vector3(1, 0, 0);
  tangent.normalize();
  const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();

  shape.moveTo(0, 0);
  for (let i = 1; i < points.length; i++) {
    const p = points[i]!;
    const v = p.clone().sub(points[0]!);
    shape.lineTo(v.dot(tangent), v.dot(bitangent));
  }
  shape.closePath();
  return shape;
}

function buildTransportParticles(arcs: { points: THREE.Vector3[]; color: number; active: boolean }[]): void {
  const PARTICLES_PER_ARC = 20;
  const total = arcs.length * PARTICLES_PER_ARC;
  const positions = new Float32Array(total * 3);
  const colors = new Float32Array(total * 3);
  const arcIndices = new Float32Array(total);
  const progresses = new Float32Array(total);
  const arcPointCounts = new Float32Array(total);

  let idx = 0;
  for (let a = 0; a < arcs.length; a++) {
    const arc = arcs[a]!;
    const col = new THREE.Color(arc.color);
    for (let i = 0; i < PARTICLES_PER_ARC; i++) {
      positions[idx * 3] = arc.points[0]!.x;
      positions[idx * 3 + 1] = arc.points[0]!.y;
      positions[idx * 3 + 2] = arc.points[0]!.z;
      colors[idx * 3] = col.r;
      colors[idx * 3 + 1] = col.g;
      colors[idx * 3 + 2] = col.b;
      arcIndices[idx] = a;
      progresses[idx] = i / PARTICLES_PER_ARC;
      arcPointCounts[idx] = arc.points.length;
      idx++;
    }
  }

  // Pack arc control points into a data texture
  const maxPoints = 32;
  const texData = new Float32Array(arcs.length * maxPoints * 3);
  for (let a = 0; a < arcs.length; a++) {
    const pts = arcs[a]!.points;
    for (let p = 0; p < maxPoints; p++) {
      const pt = pts[Math.min(p, pts.length - 1)]!;
      texData[a * maxPoints * 3 + p * 3] = pt.x;
      texData[a * maxPoints * 3 + p * 3 + 1] = pt.y;
      texData[a * maxPoints * 3 + p * 3 + 2] = pt.z;
    }
  }
  const arcTexture = new THREE.DataTexture(texData, maxPoints, arcs.length, THREE.RGBAFormat, THREE.FloatType);
  arcTexture.needsUpdate = true;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aArcIndex', new THREE.BufferAttribute(arcIndices, 1));
  geo.setAttribute('aProgress', new THREE.BufferAttribute(progresses, 1));
  geo.setAttribute('aArcPointCount', new THREE.BufferAttribute(arcPointCounts, 1));

  const uniforms = { uTime: { value: 0 }, uArcTexture: { value: arcTexture }, uMaxPoints: { value: maxPoints } };
  transportUniforms = uniforms;

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      attribute float aArcIndex;
      attribute float aProgress;
      attribute float aArcPointCount;
      uniform float uTime;
      uniform sampler2D uArcTexture;
      uniform float uMaxPoints;
      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        vColor = color;
        float prog = mod(aProgress + uTime * 0.3, 1.0);
        float fi = prog * (aArcPointCount - 1.0);
        int i0 = int(fi);
        int i1 = min(i0 + 1, int(aArcPointCount) - 1);
        float frac = fi - float(i0);
        vec2 uv0 = vec2((float(i0) + 0.5) / uMaxPoints, (aArcIndex + 0.5));
        vec2 uv1 = vec2((float(i1) + 0.5) / uMaxPoints, (aArcIndex + 0.5));
        vec3 p0 = texture2D(uArcTexture, uv0).xyz;
        vec3 p1 = texture2D(uArcTexture, uv1).xyz;
        vec3 pos = mix(p0, p1, frac);
        vAlpha = sin(prog * 3.14159);

        vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mvPos;
        gl_PointSize = 3.0 * (300.0 / -mvPos.z);
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec2 c = gl_PointCoord - vec2(0.5);
        if (length(c) > 0.5) discard;
        gl_FragColor = vec4(vColor * vAlpha * 1.5, vAlpha * 0.8);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    vertexColors: true,
  });

  transportParticles = new THREE.Points(geo, mat);
  transportGroup.add(transportParticles);
}

function animate() {
  animationId = requestAnimationFrame(animate);
  controls.update();

  // Slow earth self-rotation (markers + earth rotate together)
  earthMesh.rotation.y += 0.0005;
  wireframeMesh.rotation.y += 0.0005;
  coastlineGroup.rotation.y += 0.0005;
  atmosphereMesh.rotation.y += 0.0005;
  markerGroup.rotation.y += 0.0005;
  transportGroup.rotation.y += 0.0005;
  terrainModGroup.rotation.y += 0.0005;
  if (pollutionMesh)
    pollutionMesh.rotation.y += 0.0005;
  if (forestMesh)
    forestMesh.rotation.y += 0.0005;

  // Pulse active facility lines
  const time = Date.now() * 0.001;
  markerGroup.children.forEach((child) => {
    if (child.type === 'Line') {
      const mat = (child as THREE.Line).material as THREE.LineBasicMaterial;
      if (mat.transparent) {
        mat.opacity = 0.6 + Math.sin(time * 2 + child.id) * 0.2;
      }
    }
  });

  // Update transport particle shader time
  if (transportUniforms) {
    transportUniforms.uTime.value = time;
  }

  if (composer) {
    composer.render();
  }
  else {
    renderer.render(scene, camera);
  }
}

function onResize() {
  if (!container.value)
    return;
  const w = container.value.clientWidth;
  const h = container.value.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

watch(() => props.facilities, updateMarkers, { deep: true });
watch(() => props.transports, updateMarkers, { deep: true });
watch(() => props.terrainModifications, updateMarkers, { deep: true });
watch(() => [props.pollutionLevel, props.forestCoverage, props.biodiversity, props.waterQuality], () => {
  // Earth tint reflects water quality + overall health
  updateEarthTint();
  // Fetch updated forest grid (location-specific depletion)
  updateForestGrid();
  // Fetch updated pollution grid (location-specific pollution)
  updatePollutionGrid();
});

// Toggle pollution overlay visibility from the HUD "POLLUTION MAP" button
watch(() => props.showPollutionMap, (visible) => {
  if (pollutionMesh) {
    pollutionMesh.visible = visible ?? false;
  }
});

onMounted(() => {
  try {
    init();
  }
  catch (err) {
    console.error('EarthGlobe init failed:', err);
    return;
  }
  updateMarkers();
  window.addEventListener('resize', onResize);
});

onUnmounted(() => {
  cancelAnimationFrame(animationId);
  window.removeEventListener('resize', onResize);
  renderer?.domElement.removeEventListener('pointerdown', onPointerDown);
  renderer?.domElement.removeEventListener('pointermove', onPointerMove);
  controls?.dispose();
  renderer?.dispose();
  renderer?.forceContextLoss();
  if (container.value && renderer?.domElement.parentNode === container.value)
    container.value.removeChild(renderer.domElement);
});
</script>

<template>
  <div ref="container" class="w-full h-full">
    <div
      v-if="hoverTooltip"
      class="pointer-events-none fixed z-50 rounded-md border border-cyan-500/60 bg-slate-900/95 px-2 py-1 text-xs text-cyan-100 shadow-lg shadow-cyan-500/20"
      :style="{ left: `${hoverTooltip.x + 12}px`, top: `${hoverTooltip.y + 12}px` }"
    >
      <div class="font-semibold text-cyan-300">
        {{ hoverTooltip.name }}
      </div>
      <div class="text-slate-300">
        {{ hoverTooltip.type }} · {{ hoverTooltip.status }}
      </div>
    </div>
  </div>
</template>
