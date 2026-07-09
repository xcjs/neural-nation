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
let particleSystem: THREE.Points | null = null
let particleUniforms: { uTime: { value: number }, uCount: { value: number } } | null = null
let transportParticles: THREE.Points | null = null
let transportUniforms: { uTime: { value: number } } | null = null

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

  const PARTICLES_PER_FACILITY = 40

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

  // Update GPU particle shader time
  if (particleUniforms) {
    particleUniforms.uTime.value = time
  }
  if (transportUniforms) {
    transportUniforms.uTime.value = time
  }

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