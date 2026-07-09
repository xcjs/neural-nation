<template>
  <div ref="container" class="w-full h-full"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as THREE from 'three'
import type { FacilitySummary } from '~/lib/types/facility'
import type { TransportSummary } from '~/lib/types/transport'

const props = defineProps<{
  facilities: FacilitySummary[]
  transports: TransportSummary[]
  quality: 'low' | 'medium' | 'high'
}>()

const container = ref<HTMLDivElement | null>(null)
let renderer: THREE.WebGLRenderer
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let animationId: number
let earthMesh: THREE.Mesh
let wireframeMesh: THREE.LineSegments
let atmosphereMesh: THREE.Mesh
let markerGroup: THREE.Group
let transportGroup: THREE.Group
let particleGroup: THREE.Group

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

  // Lighting
  scene.add(new THREE.AmbientLight(0x4488ff, 0.3))
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8)
  dirLight.position.set(5, 3, 5)
  scene.add(dirLight)

  // Starfield background
  addStars()

  animate()
}

function addStars() {
  const starGeo = new THREE.BufferGeometry()
  const starCount = 1000
  const positions = new Float32Array(starCount * 3)
  for (let i = 0; i < starCount; i++) {
    const r = 20 + Math.random() * 30
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
    positions[i * 3 + 2] = r * Math.cos(phi)
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const starMat = new THREE.PointsMaterial({ color: 0x444466, size: 0.05, transparent: true, opacity: 0.6 })
  scene.add(new THREE.Points(starGeo, starMat))
}

function updateMarkers() {
  // Clear existing
  while (markerGroup.children.length > 0) markerGroup.remove(markerGroup.children[0]!)
  while (transportGroup.children.length > 0) transportGroup.remove(transportGroup.children[0]!)

  const markerColors: Record<string, number> = {
    Extractor: 0xff8800,
    Farm: 0x44ff44,
    Forestry: 0x22aa22,
    WaterPump: 0x4488ff,
    Processor: 0xff4400,
    Smelter: 0xff6600,
    Refinery: 0xff8800,
    ChemicalPlant: 0xffaa00,
    Factory: 0xff44ff,
    AdvancedFactory: 0xaa00ff,
    ResearchLab: 0xff00ff,
    PowerPlant: 0xffff00,
    SolarFarm: 0xffff00,
    WindFarm: 0x00ffff,
    HydroPlant: 0x0088ff,
    NuclearReactor: 0xff8800,
    BreederReactor: 0xff6600,
    FusionReactor: 0xaaffff,
    BiomassPlant: 0x44aa00,
    BiogasPlant: 0x66aa00,
    EthanolRefinery: 0x88aa00,
    SoylentPlant: 0xaa0033,
    DieselGenerator: 0x888888,
    CoalPlant: 0x666666,
    GasPlant: 0x888888,
    OilPlant: 0x666688,
    GeothermalPlant: 0xff4422,
    Storage: 0x00aaff,
    BatteryBank: 0x00aaff,
    Spaceport: 0x00ffff,
    RocketAssembly: 0x00ccff,
    SpaceStation: 0xffffff,
    OrbitalRefinery: 0xaaccff,
    LunarMine: 0xddccaa,
    DeepSpaceProbe: 0xaaaaff,
    SpaceHabitat: 0xffffff,
    Excavator: 0xcc8844,
    Dredger: 0xcc8844,
    Terraformer: 0xcc6622,
    PlanetaryEngine: 0xff4400,
  }

  for (const f of props.facilities) {
    const pos = latLonToVec3(f.lat, f.lon, EARTH_RADIUS * 1.02)
    const color = markerColors[f.type] ?? 0x00ffff
    const size = f.status === 'Active' ? 0.02 : 0.015
    const markerGeo = new THREE.OctahedronGeometry(size, 0)
    const markerMat = new THREE.MeshBasicMaterial({ color })
    const marker = new THREE.Mesh(markerGeo, markerMat)
    marker.position.copy(pos)
    markerGroup.add(marker)

    // Glow dot
    const dotGeo = new THREE.SphereGeometry(size * 1.8, 8, 8)
    const dotMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3 })
    const dot = new THREE.Mesh(dotGeo, dotMat)
    dot.position.copy(pos)
    markerGroup.add(dot)
  }

  // Transport arcs
  for (const t of props.transports) {
    const fromPos = latLonToVec3(t.fromLat, t.fromLon, EARTH_RADIUS * 1.02)
    const toPos = latLonToVec3(t.toLat, t.toLon, EARTH_RADIUS * 1.02)
    const midPoint = new THREE.Vector3().addVectors(fromPos, toPos).multiplyScalar(0.5)
    midPoint.normalize().multiplyScalar(EARTH_RADIUS * 1.15)
    const curve = new THREE.QuadraticBezierCurve3(fromPos, midPoint, toPos)
    const points = curve.getPoints(30)
    const arcGeo = new THREE.BufferGeometry().setFromPoints(points)
    const arcMat = new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.4 })
    transportGroup.add(new THREE.Line(arcGeo, arcMat))
  }
}

function animate() {
  animationId = requestAnimationFrame(animate)
  earthMesh.rotation.y += 0.0005
  wireframeMesh.rotation.y += 0.0005
  atmosphereMesh.rotation.y += 0.0005
  markerGroup.rotation.y += 0.0005
  transportGroup.rotation.y += 0.0005
  particleGroup.rotation.y += 0.0005

  // Pulse markers
  const time = Date.now() * 0.001
  markerGroup.children.forEach((child, i) => {
    if (i % 2 === 1) {
      const mesh = child as THREE.Mesh
      const mat = mesh.material as THREE.MeshBasicMaterial
      mat.opacity = 0.2 + Math.sin(time * 2 + i) * 0.15
    }
  })

  renderer.render(scene, camera)
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

onMounted(() => {
  init()
  updateMarkers()
  window.addEventListener('resize', onResize)
})

onUnmounted(() => {
  cancelAnimationFrame(animationId)
  window.removeEventListener('resize', onResize)
  renderer?.dispose()
})
</script>