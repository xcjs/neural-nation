<template>
  <div ref="container" class="w-full h-full"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { feature } from 'topojson-client'
import landTopo from 'world-atlas/land-110m.json'
import type { FacilitySummary } from '~/lib/types/facility'
import type { TransportSummary } from '~/lib/types/transport'
import type { TerrainModification } from '~/lib/types/terrain'

const emit = defineEmits<{
  (e: 'facility-click', facilityId: number): void
}>()

const props = defineProps<{
  facilities: FacilitySummary[]
  transports: TransportSummary[]
  quality: 'low' | 'medium' | 'high'
  terrainModifications?: TerrainModification[]
  pollutionLevel?: number
  forestCoverage?: number
  biodiversity?: number
}>()

const container = ref<HTMLDivElement | null>(null)
let renderer: THREE.WebGLRenderer
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let controls: OrbitControls
let raycaster: THREE.Raycaster
let pointer: THREE.Vector2
let animationId: number
let earthMesh: THREE.Mesh
let wireframeMesh: THREE.LineSegments
let atmosphereMesh: THREE.Mesh
let coastlineGroup: THREE.Group
let markerGroup: THREE.Group
let transportGroup: THREE.Group
let particleGroup: THREE.Group
let particleSystem: THREE.Points | null = null
let particleUniforms: { uTime: { value: number }, uCount: { value: number } } | null = null
let transportParticles: THREE.Points | null = null
let transportUniforms: { uTime: { value: number } } | null = null
let terrainModGroup: THREE.Group
let composer: EffectComposer | null = null
let bloomPass: UnrealBloomPass | null = null
let pollutionMesh: THREE.Mesh | null = null

const EARTH_RADIUS = 1

function latLonToVec3(lat: number, lon: number, r: number = EARTH_RADIUS): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  )
}

function buildCoastlines(): THREE.Group {
  const group = new THREE.Group()
  const lineMat = new THREE.LineBasicMaterial({
    color: 0x00aaff,
    transparent: true,
    opacity: 0.5,
  })

  // Convert TopoJSON to GeoJSON FeatureCollection
  const geojson = feature(landTopo as never, (landTopo as never as { objects: { land: unknown } }).objects.land as never) as unknown as { type: string; features: Array<{ geometry: { type: string; coordinates: number[][] | number[][][] } }> }

  for (const feat of geojson.features) {
    const geom = feat.geometry
    if (geom.type === 'Polygon') {
      for (const ring of geom.coordinates as number[][][]) {
        addRing(group, ring, lineMat)
      }
    } else if (geom.type === 'MultiPolygon') {
      for (const polygon of geom.coordinates as number[][][][]) {
        for (const ring of polygon) {
          addRing(group, ring, lineMat)
        }
      }
    }
  }

  return group
}

function addRing(group: THREE.Group, ring: number[][], mat: THREE.LineBasicMaterial): void {
  const points: THREE.Vector3[] = []
  for (const [lon, lat] of ring) {
    points.push(latLonToVec3(lat, lon, EARTH_RADIUS * 1.002))
  }
  if (points.length < 2) return
  const geo = new THREE.BufferGeometry().setFromPoints(points)
  const line = new THREE.Line(geo, mat)
  group.add(line)
}

function init() {
  if (!container.value) return
  const w = container.value.clientWidth
  const h = container.value.clientHeight

  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 100)
  camera.position.set(0, 0, 2.8)

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setSize(w, h)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  container.value.appendChild(renderer.domElement)

  // Orbit controls — drag to rotate, scroll to zoom, touch supported
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.rotateSpeed = 0.5
  controls.minDistance = 1.2
  controls.maxDistance = 8
  controls.enablePan = false

  // Raycaster for facility click detection
  raycaster = new THREE.Raycaster()
  pointer = new THREE.Vector2()
  renderer.domElement.addEventListener('pointerdown', onPointerDown)

  // Earth sphere — wireframe/holographic style
  const geometry = new THREE.IcosahedronGeometry(EARTH_RADIUS, 6)
  const material = new THREE.MeshBasicMaterial({
    color: 0x002233,
    transparent: true,
    opacity: 0.6,
  })
  earthMesh = new THREE.Mesh(geometry, material)
  scene.add(earthMesh)

  // Wireframe overlay
  const wireGeo = new THREE.WireframeGeometry(geometry)
  const wireMat = new THREE.LineBasicMaterial({
    color: 0x00ccff,
    transparent: true,
    opacity: 0.15,
  })
  wireframeMesh = new THREE.LineSegments(wireGeo, wireMat)
  scene.add(wireframeMesh)

  // Continent coastlines from real GeoJSON data
  coastlineGroup = buildCoastlines()
  scene.add(coastlineGroup)

  // Atmosphere glow (fresnel effect)
  const atmoGeo = new THREE.IcosahedronGeometry(EARTH_RADIUS * 1.05, 4)
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
  })
  atmosphereMesh = new THREE.Mesh(atmoGeo, atmoMat)
  scene.add(atmosphereMesh)

  // Marker groups
  markerGroup = new THREE.Group()
  scene.add(markerGroup)
  transportGroup = new THREE.Group()
  scene.add(transportGroup)
  particleGroup = new THREE.Group()
  scene.add(particleGroup)
  terrainModGroup = new THREE.Group()
  scene.add(terrainModGroup)

  // Pollution heatmap overlay
  buildPollutionOverlay()

  // Bloom post-processing (only for medium/high quality)
  if (props.quality !== 'low') {
    composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(w, h),
      props.quality === 'high' ? 0.8 : 0.5, // strength
      0.4, // radius
      0.2, // threshold
    )
    composer.addPass(bloomPass)
  }

  animate()
}

function buildPollutionOverlay(): void {
  if (pollutionMesh) {
    scene.remove(pollutionMesh)
    pollutionMesh.geometry.dispose()
    ;(pollutionMesh.material as THREE.Material).dispose()
  }
  const geo = new THREE.IcosahedronGeometry(EARTH_RADIUS * 1.01, 4)
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uPollution: { value: (props.pollutionLevel ?? 0) / 100 },
      uForest: { value: (props.forestCoverage ?? 100) / 100 },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vPos;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uPollution;
      uniform float uForest;
      varying vec3 vNormal;
      varying vec3 vPos;
      void main() {
        // Pollution: brown/gray haze, more visible at high pollution
        vec3 pollutionColor = vec3(0.4, 0.3, 0.15);
        // Forest/biome health: green tint when healthy, fades when degraded
        vec3 healthyColor = vec3(0.1, 0.3, 0.08);
        float health = uForest * (1.0 - uPollution * 0.5);
        vec3 color = mix(pollutionColor * uPollution, healthyColor * health, 0.5);
        float alpha = uPollution * 0.4 + (1.0 - uForest) * 0.2;
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  pollutionMesh = new THREE.Mesh(geo, mat)
  scene.add(pollutionMesh)
}

function updateEarthTint(): void {
  const pollution = (props.pollutionLevel ?? 0) / 100
  const forest = (props.forestCoverage ?? 100) / 100
  const biodiversity = (props.biodiversity ?? 100) / 100
  // Healthy earth: blue-cyan (0x002233). Degraded: brownish gray.
  const health = (forest + biodiversity) * 0.5 * (1 - pollution * 0.3)
  const r = 0.0 + (1 - health) * 0.25
  const g = 0.13 * health + (1 - health) * 0.1
  const b = 0.2 * health + (1 - health) * 0.05
  const mat = earthMesh.material as THREE.MeshBasicMaterial
  mat.color.setRGB(r, g, b)
}

function getMarkerGeometry(type: string, size: number): THREE.BufferGeometry {
  switch (type) {
    case 'Extractor':
    case 'Excavator':
    case 'Dredger':
      // Diamond
      return new THREE.OctahedronGeometry(size, 0)
    case 'Farm':
    case 'Forestry':
    case 'WaterPump':
    case 'HydroPlant':
      // Circle
      return new THREE.CircleGeometry(size, 16)
    case 'Processor':
    case 'Smelter':
    case 'Refinery':
    case 'ChemicalPlant':
    case 'EthanolRefinery':
    case 'SoylentPlant':
      // Square
      return new THREE.PlaneGeometry(size * 1.4, size * 1.4)
    case 'Factory':
    case 'AdvancedFactory':
    case 'OilPlant':
      // Square with inner square (use RingGeometry for hollow look)
      return new THREE.RingGeometry(size * 0.5, size, 4)
    case 'PowerPlant':
    case 'CoalPlant':
    case 'GasPlant':
    case 'DieselGenerator':
    case 'BiomassPlant':
    case 'BiogasPlant':
    case 'GeothermalPlant':
    case 'NuclearReactor':
    case 'BreederReactor':
    case 'FusionReactor':
      // Hexagon
      return new THREE.CylinderGeometry(size, size, size * 0.5, 6)
    case 'SolarFarm':
    case 'WindFarm':
      // Flat panel
      return new THREE.PlaneGeometry(size * 1.6, size * 1.6)
    case 'Storage':
    case 'BatteryBank':
      // Triangle
      return new THREE.ConeGeometry(size, size * 1.5, 3)
    case 'ResearchLab':
    case 'SpaceStation':
    case 'DeepSpaceProbe':
    case 'SpaceHabitat':
      // Star (5-point cone approximation)
      return new THREE.ConeGeometry(size, size * 2, 5)
    case 'Spaceport':
    case 'RocketAssembly':
    case 'OrbitalRefinery':
    case 'LunarMine':
      // Inverted cone (launch pad shape)
      return new THREE.ConeGeometry(size, size * 1.5, 8)
    case 'Terraformer':
    case 'PlanetaryEngine':
      // Large octahedron (diamond)
      return new THREE.OctahedronGeometry(size * 1.2, 0)
    default:
      return new THREE.OctahedronGeometry(size, 0)
  }
}

function onPointerDown(event: PointerEvent) {
  if (!container.value) return
  const rect = renderer.domElement.getBoundingClientRect()
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

  raycaster.setFromCamera(pointer, camera)
  // Collect all marker meshes from LOD children
  const meshes: THREE.Object3D[] = []
  markerGroup.children.forEach((child) => {
    const lod = child as THREE.LOD
    if (lod.isLOD) {
      lod.children.forEach((c) => { if (c.type === 'Mesh') meshes.push(c) })
    } else {
      meshes.push(child)
    }
  })

  const intersects = raycaster.intersectObjects(meshes, false)
  if (intersects.length > 0) {
    const hit = intersects[0]!.object
    const facilityId = hit.userData.facilityId as number | undefined
    if (facilityId !== undefined) {
      emit('facility-click', facilityId)
    }
  }
}

function updateMarkers() {
  while (markerGroup.children.length > 0) markerGroup.remove(markerGroup.children[0]!)
  while (transportGroup.children.length > 0) transportGroup.remove(transportGroup.children[0]!)
  while (particleGroup.children.length > 0) particleGroup.remove(particleGroup.children[0]!)
  particleSystem = null
  particleUniforms = null
  transportParticles = null
  transportUniforms = null

  const markerColors: Record<string, number> = {
    Extractor: 0xff8800, Farm: 0x44ff44, Forestry: 0x22aa22, WaterPump: 0x4488ff,
    Processor: 0xff4400, Smelter: 0xff6600, Refinery: 0xff8800, ChemicalPlant: 0xffaa00,
    Factory: 0xff44ff, AdvancedFactory: 0xaa00ff, ResearchLab: 0xff00ff,
    PowerPlant: 0xffff00, SolarFarm: 0xffff00, WindFarm: 0x00ffff, HydroPlant: 0x0088ff,
    NuclearReactor: 0xff8800, BreederReactor: 0xff6600, FusionReactor: 0xaaffff,
    BiomassPlant: 0x44aa00, BiogasPlant: 0x66aa00, EthanolRefinery: 0x88aa00,
    SoylentPlant: 0xaa0033, DieselGenerator: 0x888888, CoalPlant: 0x666666,
    GasPlant: 0x888888, OilPlant: 0x666688, GeothermalPlant: 0xff4422,
    Storage: 0x00aaff, BatteryBank: 0x00aaff, Spaceport: 0x00ffff,
    RocketAssembly: 0x00ccff, SpaceStation: 0xffffff, OrbitalRefinery: 0xaaccff,
    LunarMine: 0xddccaa, DeepSpaceProbe: 0xaaaaff, SpaceHabitat: 0xffffff,
    Excavator: 0xcc8844, Dredger: 0xcc8844, Terraformer: 0xcc6622, PlanetaryEngine: 0xff4400,
  }

  // Facility type → motion type for particle shader:
  // 0=none/idle, 1=rising(extractor), 2=swirl(farm), 3=orbit(processor),
  // 4=stream(factory), 5=smoke(power), 6=flash(nuclear), 7=flat(solar),
  // 8=rotate(wind), 9=halo(storage), 10=lissajous(research)
  const motionByType: Record<string, number> = {
    Extractor: 1, Farm: 2, Forestry: 2, WaterPump: 2,
    Processor: 3, Smelter: 3, Refinery: 3, ChemicalPlant: 3,
    Factory: 4, AdvancedFactory: 4,
    PowerPlant: 5, CoalPlant: 5, GasPlant: 5, OilPlant: 5, DieselGenerator: 5,
    BiomassPlant: 5, BiogasPlant: 5, GeothermalPlant: 5,
    NuclearReactor: 6, BreederReactor: 6, FusionReactor: 6,
    SolarFarm: 7, WindFarm: 8, HydroPlant: 2,
    EthanolRefinery: 3, SoylentPlant: 4,
    Storage: 9, BatteryBank: 9,
    ResearchLab: 10, AdvancedFactory: 10,
    Spaceport: 1, RocketAssembly: 1, SpaceStation: 10,
    OrbitalRefinery: 3, LunarMine: 1, DeepSpaceProbe: 10, SpaceHabitat: 9,
    Excavator: 1, Dredger: 2, Terraformer: 1, PlanetaryEngine: 1,
  }

  const PARTICLES_PER_FACILITY = props.quality === 'low' ? 10 : props.quality === 'medium' ? 25 : 40

  // Build marker meshes + collect particle data
  const facilityParticleData: {
    pos: THREE.Vector3
    color: THREE.Color
    motion: number
    activity: number
  }[] = []
  for (const f of props.facilities) {
    const pos = latLonToVec3(f.lat, f.lon, EARTH_RADIUS * 1.02)

    const color = markerColors[f.type] ?? 0x00ffff
    const size = f.status === 'Active' ? 0.02 : 0.015

    // LOD: high detail (type-specific shape + glow) up close, billboard far away
    const lod = new THREE.LOD()
    const markerGeo = getMarkerGeometry(f.type, size)
    const markerMat = new THREE.MeshBasicMaterial({ color })
    const marker = new THREE.Mesh(markerGeo, markerMat)
    marker.position.copy(pos)
    marker.lookAt(0, 0, 0)
    marker.userData.facilityId = f.id
    lod.addLevel(marker, 0)
    lod.userData.facilityId = f.id

    // Glow dot
    const dotGeo = new THREE.SphereGeometry(size * 1.8, 8, 8)
    const dotMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3 })
    const dot = new THREE.Mesh(dotGeo, dotMat)
    dot.position.copy(pos)
    dot.userData.facilityId = f.id
    lod.addLevel(dot, 1.5)

    // Simple point sprite at far distance
    const farGeo = new THREE.BufferGeometry()
    farGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([pos.x, pos.y, pos.z]), 3))
    const farMat = new THREE.PointsMaterial({ color, size: 3, sizeAttenuation: false, transparent: true, opacity: 0.8 })
    const farPoint = new THREE.Points(farGeo, farMat)
    farPoint.userData.facilityId = f.id
    lod.addLevel(farPoint, 5)

    markerGroup.add(lod)

    // Particle cloud data (only for Active facilities)
    if (f.status === 'Active') {
      const motion = motionByType[f.type] ?? 0
      if (motion > 0) {
        facilityParticleData.push({
          pos: pos.clone(),
          color: new THREE.Color(color),
          motion,
          activity: Math.min(1, (f as { throughput?: number }).throughput || 0.5),
        })
      }
    }
  }

  // Build GPU particle system
  if (facilityParticleData.length > 0) {
    buildParticleSystem(facilityParticleData, PARTICLES_PER_FACILITY)
  }

  // Transport arcs + flow particles
  const arcData: { points: THREE.Vector3[]; color: number; active: boolean }[] = []
  for (const t of props.transports) {
    const fromPos = latLonToVec3(t.fromLat, t.fromLon, EARTH_RADIUS * 1.02)
    const toPos = latLonToVec3(t.toLat, t.toLon, EARTH_RADIUS * 1.02)
    const midPoint = new THREE.Vector3().addVectors(fromPos, toPos).multiplyScalar(0.5)
    midPoint.normalize().multiplyScalar(EARTH_RADIUS * 1.15)
    const curve = new THREE.QuadraticBezierCurve3(fromPos, midPoint, toPos)
    const points = curve.getPoints(30)
    const arcGeo = new THREE.BufferGeometry().setFromPoints(points)
    const isActive = (t as { flowRate?: number }).flowRate && (t as { flowRate?: number }).flowRate > 0
    const arcColor = (t as { resourceKey?: string }).resourceKey ? 0x00ffff : 0x446688
    const arcMat = new THREE.LineBasicMaterial({
      color: arcColor,
      transparent: true,
      opacity: isActive ? 0.6 : 0.2,
    })
    transportGroup.add(new THREE.Line(arcGeo, arcMat))
    if (isActive) {
      arcData.push({ points, color: arcColor, active: true })
    }
  }

  if (arcData.length > 0) {
    buildTransportParticles(arcData)
  }

  // Terrain modification markers
  while (terrainModGroup.children.length > 0) terrainModGroup.remove(terrainModGroup.children[0]!)
  if (props.terrainModifications && props.terrainModifications.length > 0) {
    const modColors: Record<string, number> = {
      flatten_terrain: 0xcc8844,
      dig_canal: 0x4488ff,
      build_road_embankment: 0x886644,
      create_reservoir: 0x44aaff,
      drain_area: 0xaa8844,
      divert_river: 0x44aaff,
      level_mountain: 0xcc6622,
      raise_land: 0xcc8844,
      excavate_mine_shaft: 0x884422,
      create_mountain: 0xaa4422,
      shift_continental_plate: 0xff4400,
      ocean_to_land: 0xcc8844,
      land_to_ocean: 0x4488ff,
    }
    for (const mod of props.terrainModifications) {
      const pos = latLonToVec3(mod.latIndex, mod.lonIndex, EARTH_RADIUS * 1.03)
      const color = modColors[mod.reason] ?? 0xff8800
      const raiseAmt = mod.elevationDelta > 0 ? 1 : 0
      const size = 0.015 + Math.min(Math.abs(mod.elevationDelta) / 5000, 1) * 0.02
      const ringGeo = new THREE.RingGeometry(size, size * 1.5, 16)
      const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
      const ring = new THREE.Mesh(ringGeo, ringMat)
      ring.position.copy(pos)
      ring.lookAt(0, 0, 0)
      terrainModGroup.add(ring)

      // Vertical indicator: upward spike for raise, downward for lower
      const spikeDir = raiseAmt ? 1 : -1
      const spikeGeo = new THREE.ConeGeometry(0.005, size * 2, 8)
      const spikeMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 })
      const spike = new THREE.Mesh(spikeGeo, spikeMat)
      spike.position.copy(pos)
      spike.lookAt(pos.clone().multiplyScalar(2))
      spike.rotateX(spikeDir * Math.PI / 2)
      spike.position.add(pos.clone().normalize().multiplyScalar(spikeDir * size))
      terrainModGroup.add(spike)

      // Patch coastlines for ocean↔land transitions
      if (mod.reason === 'ocean_to_land' || mod.reason === 'land_to_ocean') {
        patchCoastline(mod.latIndex, mod.lonIndex, mod.reason === 'ocean_to_land')
      }
    }
  }
}

function patchCoastline(lat: number, lon: number, toLand: boolean): void {
  // Build a small filled cell patch at this location to visually reshape the coastline.
  // Cell size matches the terrain grid resolution (~1°).
  const halfCell = 0.5
  const corners: [number, number][] = [
    [lat - halfCell, lon - halfCell],
    [lat + halfCell, lon - halfCell],
    [lat + halfCell, lon + halfCell],
    [lat - halfCell, lon + halfCell],
  ]
  const points = corners.map(([la, lo]) => latLonToVec3(la, lo, EARTH_RADIUS * 1.003))
  // Close the loop
  points.push(points[0]!)

  if (toLand) {
    // Add a filled land patch (cyan outline + semi-transparent fill)
    const fillMat = new THREE.MeshBasicMaterial({
      color: 0x00aaff,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
    })
    const shape = buildShape(points)
    const fillGeo = new THREE.ShapeGeometry(shape)
    const fill = new THREE.Mesh(fillGeo, fillMat)
    positionOnSphere(fill, points[0]!)
    coastlineGroup.add(fill)

    // Outline matching existing coastlines
    const lineGeo = new THREE.BufferGeometry().setFromPoints(points)
    const lineMat = new THREE.LineBasicMaterial({ color: 0x00aaff, transparent: true, opacity: 0.5 })
    coastlineGroup.add(new THREE.Line(lineGeo, lineMat))
  } else {
    // Land to ocean: overlay a dark blue water patch that obscures the existing coastline
    const fillMat = new THREE.MeshBasicMaterial({
      color: 0x002233,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
    })
    const shape = buildShape(points)
    const fillGeo = new THREE.ShapeGeometry(shape)
    const fill = new THREE.Mesh(fillGeo, fillMat)
    positionOnSphere(fill, points[0]!)
    coastlineGroup.add(fill)

    // Blue outline to indicate new water boundary
    const lineGeo = new THREE.BufferGeometry().setFromPoints(points)
    const lineMat = new THREE.LineBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.4 })
    coastlineGroup.add(new THREE.Line(lineGeo, lineMat))
  }
}

function positionOnSphere(mesh: THREE.Mesh, anchor: THREE.Vector3): void {
  const normal = anchor.clone().normalize()
  mesh.position.copy(anchor)
  mesh.lookAt(0, 0, 0)
  // ShapeGeometry is in XY plane; lookAt orients Z toward center, so XY faces outward
  mesh.rotateX(Math.PI) // flip so the shape faces outward
}

function buildShape(points: THREE.Vector3[]): THREE.Shape {
  const shape = new THREE.Shape()
  // Project 3D points onto a 2D plane (tangent to sphere at cell center) for ShapeGeometry
  // Use the first point's normal as the plane basis
  const normal = points[0]!.clone().normalize()
  const up = new THREE.Vector3(0, 1, 0)
  let tangent = new THREE.Vector3().crossVectors(normal, up)
  if (tangent.lengthSq() < 0.01) tangent = new THREE.Vector3(1, 0, 0)
  tangent.normalize()
  const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize()

  shape.moveTo(0, 0)
  for (let i = 1; i < points.length; i++) {
    const p = points[i]!
    const v = p.clone().sub(points[0]!)
    shape.lineTo(v.dot(tangent), v.dot(bitangent))
  }
  shape.closePath()
  return shape
}

function buildParticleSystem(
  facilities: { pos: THREE.Vector3; color: THREE.Color; motion: number; activity: number }[],
  particlesPerFacility: number,
): void {
  const totalParticles = facilities.length * particlesPerFacility
  const positions = new Float32Array(totalParticles * 3)
  const colors = new Float32Array(totalParticles * 3)
  const facilityPositions = new Float32Array(totalParticles * 3)
  const motions = new Float32Array(totalParticles)
  const activities = new Float32Array(totalParticles)
  const offsets = new Float32Array(totalParticles)

  let idx = 0
  for (const f of facilities) {
    for (let i = 0; i < particlesPerFacility; i++) {
      positions[idx * 3] = f.pos.x
      positions[idx * 3 + 1] = f.pos.y
      positions[idx * 3 + 2] = f.pos.z
      colors[idx * 3] = f.color.r
      colors[idx * 3 + 1] = f.color.g
      colors[idx * 3 + 2] = f.color.b
      facilityPositions[idx * 3] = f.pos.x
      facilityPositions[idx * 3 + 1] = f.pos.y
      facilityPositions[idx * 3 + 2] = f.pos.z
      motions[idx] = f.motion
      activities[idx] = f.activity
      offsets[idx] = Math.random()
      idx++
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.setAttribute('aFacilityPos', new THREE.BufferAttribute(facilityPositions, 3))
  geo.setAttribute('aMotion', new THREE.BufferAttribute(motions, 1))
  geo.setAttribute('aActivity', new THREE.BufferAttribute(activities, 1))
  geo.setAttribute('aOffset', new THREE.BufferAttribute(offsets, 1))

  const uniforms = {
    uTime: { value: 0 },
    uCount: { value: totalParticles },
  }
  particleUniforms = uniforms

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      attribute vec3 aFacilityPos;
      attribute float aMotion;
      attribute float aActivity;
      attribute float aOffset;
      uniform float uTime;
      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        vColor = color;
        vec3 pos = aFacilityPos;
        float t = uTime + aOffset * 6.28318;
        float spread = 0.03 + aActivity * 0.04;

        // Motion type 1: rising (extractors, terraformers)
        if (aMotion < 1.5) {
          float h = mod(t * 0.5, 1.0);
          vec3 up = normalize(aFacilityPos);
          pos += up * h * spread * 2.0;
          pos += vec3(sin(t * 3.0) * 0.005, cos(t * 2.0) * 0.005, sin(t * 4.0) * 0.005);
          vAlpha = (1.0 - h) * aActivity;
        }
        // Motion type 2: swirl (farms, water)
        else if (aMotion < 2.5) {
          float ang = t * 0.8;
          vec3 up = normalize(aFacilityPos);
          vec3 right = normalize(cross(up, vec3(0.0, 1.0, 0.0)));
          vec3 fwd = cross(up, right);
          pos += (right * cos(ang) + fwd * sin(ang)) * spread * 0.8;
          pos += up * sin(t * 0.5) * spread * 0.3;
          vAlpha = 0.5 + sin(t) * 0.2;
        }
        // Motion type 3: tight orbit (processors)
        else if (aMotion < 3.5) {
          float ang = t * 2.0;
          vec3 up = normalize(aFacilityPos);
          vec3 right = normalize(cross(up, vec3(0.0, 1.0, 0.0)));
          vec3 fwd = cross(up, right);
          pos += (right * cos(ang) + fwd * sin(ang)) * spread * 0.6;
          vAlpha = 0.6 + sin(t * 5.0) * 0.3 * aActivity;
        }
        // Motion type 4: stream (factories)
        else if (aMotion < 4.5) {
          float phase = mod(t * 0.3 + aOffset, 1.0);
          vec3 up = normalize(aFacilityPos);
          pos += up * sin(phase * 6.28) * spread * 0.5;
          pos += vec3(sin(t * 4.0) * 0.008, cos(t * 3.5) * 0.008, sin(t * 4.5) * 0.008);
          vAlpha = sin(phase * 3.14) * aActivity;
        }
        // Motion type 5: smoke (power plants)
        else if (aMotion < 5.5) {
          float h = mod(t * 0.3, 1.0);
          vec3 up = normalize(aFacilityPos);
          pos += up * h * spread * 2.5;
          pos += vec3(sin(t * 1.5) * 0.01 * h, cos(t * 1.2) * 0.01 * h, sin(t * 1.8) * 0.01 * h);
          vAlpha = (1.0 - h) * 0.5 * aActivity;
        }
        // Motion type 6: flash (nuclear)
        else if (aMotion < 6.5) {
          float ang = t * 1.5;
          vec3 up = normalize(aFacilityPos);
          vec3 right = normalize(cross(up, vec3(0.0, 1.0, 0.0)));
          vec3 fwd = cross(up, right);
          pos += (right * cos(ang) + fwd * sin(ang)) * spread * 0.5;
          float flash = pow(max(0.0, sin(t * 8.0)), 20.0);
          vAlpha = 0.5 + flash * 0.5;
        }
        // Motion type 7: flat hover (solar)
        else if (aMotion < 7.5) {
          vec3 up = normalize(aFacilityPos);
          pos += up * spread * 0.5;
          pos += vec3(sin(aOffset * 6.28) * 0.01, cos(aOffset * 6.28) * 0.01, sin(aOffset * 3.14) * 0.01);
          vAlpha = 0.6 + sin(t * 2.0 + aOffset * 6.28) * 0.2;
        }
        // Motion type 8: rotate (wind)
        else if (aMotion < 8.5) {
          float ang = t * 3.0;
          vec3 up = normalize(aFacilityPos);
          vec3 right = normalize(cross(up, vec3(0.0, 1.0, 0.0)));
          vec3 fwd = cross(up, right);
          float r = spread * 0.7;
          pos += (right * cos(ang) + fwd * sin(ang)) * r;
          vAlpha = 0.7;
        }
        // Motion type 9: halo (storage)
        else if (aMotion < 9.5) {
          float ang = t * 0.5 + aOffset * 6.28;
          vec3 up = normalize(aFacilityPos);
          vec3 right = normalize(cross(up, vec3(0.0, 1.0, 0.0)));
          vec3 fwd = cross(up, right);
          pos += (right * cos(ang) + fwd * sin(ang)) * spread * 1.2;
          pos += up * sin(ang * 2.0) * spread * 0.3;
          vAlpha = 0.4 + aActivity * 0.3;
        }
        // Motion type 10: lissajous (research, space)
        else {
          vec3 up = normalize(aFacilityPos);
          vec3 right = normalize(cross(up, vec3(0.0, 1.0, 0.0)));
          vec3 fwd = cross(up, right);
          float a = t * 1.2 + aOffset * 6.28;
          pos += right * sin(a * 3.0) * spread * 0.8;
          pos += fwd * sin(a * 2.0) * spread * 0.8;
          pos += up * sin(a * 5.0) * spread * 0.4;
          vAlpha = 0.5 + sin(t * 2.0 + aOffset * 6.28) * 0.3;
        }

        vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mvPos;
        gl_PointSize = (2.0 + aActivity * 2.0) * (300.0 / -mvPos.z);
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec2 c = gl_PointCoord - vec2(0.5);
        float d = length(c);
        if (d > 0.5) discard;
        float intensity = (1.0 - d * 2.0) * vAlpha;
        gl_FragColor = vec4(vColor * intensity * 1.5, intensity * 0.7);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    vertexColors: true,
  })

  particleSystem = new THREE.Points(geo, mat)
  particleGroup.add(particleSystem)
}

function buildTransportParticles(arcs: { points: THREE.Vector3[]; color: number; active: boolean }[]): void {
  const PARTICLES_PER_ARC = 20
  const total = arcs.length * PARTICLES_PER_ARC
  const positions = new Float32Array(total * 3)
  const colors = new Float32Array(total * 3)
  const arcIndices = new Float32Array(total)
  const progresses = new Float32Array(total)
  const arcPointCounts = new Float32Array(total)

  let idx = 0
  for (let a = 0; a < arcs.length; a++) {
    const arc = arcs[a]!
    const col = new THREE.Color(arc.color)
    for (let i = 0; i < PARTICLES_PER_ARC; i++) {
      positions[idx * 3] = arc.points[0]!.x
      positions[idx * 3 + 1] = arc.points[0]!.y
      positions[idx * 3 + 2] = arc.points[0]!.z
      colors[idx * 3] = col.r
      colors[idx * 3 + 1] = col.g
      colors[idx * 3 + 2] = col.b
      arcIndices[idx] = a
      progresses[idx] = i / PARTICLES_PER_ARC
      arcPointCounts[idx] = arc.points.length
      idx++
    }
  }

  // Pack arc control points into a data texture
  const maxPoints = 32
  const texData = new Float32Array(arcs.length * maxPoints * 3)
  for (let a = 0; a < arcs.length; a++) {
    const pts = arcs[a]!.points
    for (let p = 0; p < maxPoints; p++) {
      const pt = pts[Math.min(p, pts.length - 1)]!
      texData[a * maxPoints * 3 + p * 3] = pt.x
      texData[a * maxPoints * 3 + p * 3 + 1] = pt.y
      texData[a * maxPoints * 3 + p * 3 + 2] = pt.z
    }
  }
  const arcTexture = new THREE.DataTexture(texData, maxPoints, arcs.length, THREE.RGBAFormat, THREE.FloatType)
  arcTexture.needsUpdate = true

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.setAttribute('aArcIndex', new THREE.BufferAttribute(arcIndices, 1))
  geo.setAttribute('aProgress', new THREE.BufferAttribute(progresses, 1))
  geo.setAttribute('aArcPointCount', new THREE.BufferAttribute(arcPointCounts, 1))

  const uniforms = { uTime: { value: 0 }, uArcTexture: { value: arcTexture }, uMaxPoints: { value: maxPoints } }
  transportUniforms = uniforms

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
  })

  transportParticles = new THREE.Points(geo, mat)
  transportGroup.add(transportParticles)
}

function animate() {
  animationId = requestAnimationFrame(animate)
  controls.update()

  // Slow earth self-rotation (markers + earth rotate together)
  earthMesh.rotation.y += 0.0005
  wireframeMesh.rotation.y += 0.0005
  coastlineGroup.rotation.y += 0.0005
  atmosphereMesh.rotation.y += 0.0005
  markerGroup.rotation.y += 0.0005
  transportGroup.rotation.y += 0.0005
  particleGroup.rotation.y += 0.0005
  terrainModGroup.rotation.y += 0.0005
  if (pollutionMesh) pollutionMesh.rotation.y += 0.0005

  // Moon orbit
  // Pulse markers (handle LOD children)
  const time = Date.now() * 0.001
  markerGroup.children.forEach((child) => {
    const lod = child as THREE.LOD
    if (lod.isLOD) {
      lod.update(camera)
      const level = lod._currentLevel >= 0 ? lod.children[lod._currentLevel] : null
      if (level && level.type === 'Mesh') {
        const mat = (level as THREE.Mesh).material as THREE.MeshBasicMaterial
        if (mat.transparent) {
          mat.opacity = 0.2 + Math.sin(time * 2 + level.id) * 0.15
        }
      }
    } else if (child.type === 'Mesh') {
      const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial
      if (mat.transparent) {
        mat.opacity = 0.2 + Math.sin(time * 2 + child.id) * 0.15
      }
    }
  })

  // Update GPU particle shader time
  if (particleUniforms) {
    particleUniforms.uTime.value = time
  }
  if (transportUniforms) {
    transportUniforms.uTime.value = time
  }

  if (composer) {
    composer.render()
  } else {
    renderer.render(scene, camera)
  }
}

function onResize() {
  if (!container.value) return
  const w = container.value.clientWidth
  const h = container.value.clientHeight
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
}

watch(() => props.facilities, updateMarkers, { deep: true })
watch(() => props.transports, updateMarkers, { deep: true })
watch(() => props.terrainModifications, updateMarkers, { deep: true })
watch(() => [props.pollutionLevel, props.forestCoverage, props.biodiversity], () => {
  if (pollutionMesh) {
    const mat = pollutionMesh.material as THREE.ShaderMaterial
    mat.uniforms.uPollution.value = (props.pollutionLevel ?? 0) / 100
    mat.uniforms.uForest.value = (props.forestCoverage ?? 100) / 100
  }
  updateEarthTint()
})

onMounted(() => {
  init()
  updateMarkers()
  window.addEventListener('resize', onResize)
})

onUnmounted(() => {
  cancelAnimationFrame(animationId)
  window.removeEventListener('resize', onResize)
  renderer?.domElement.removeEventListener('pointerdown', onPointerDown)
  controls?.dispose()
  renderer?.dispose()
})
</script>