// Scenele festivalului: grinzi cu zabrele, acoperis, ecrane LED, boxe si reflectoare care se misca pe ritm.
import * as THREE from 'three'
import { aim, Batch, beam, box, glow, ledWall, lit, matte, merge, metal, place, truss, trussBetween } from './kit.js'
import { personGeometry } from './people.js'
import { STAGE, STAGE2 } from './world.js'

export const BPM = 124

const V = (x, y, z) => new THREE.Vector3(x, y, z)
const clamp01 = (v) => Math.min(1, Math.max(0, v))
const smooth = (v) => { const u = clamp01(v); return u * u * (3 - 2 * u) }

/** Un om pe scena, vazut doar ca silueta in fata ecranului. */
function performer(x, y, z, height, face) {
  const g = place(personGeometry(1), 0, 0, 0, 0, face)
  g.scale(height, height, height)
  g.translate(x, y, z)
  return g
}

/** Un reflector cu cap mobil: furca si capul. */
function fixture(x, y, z, up = false) {
  const s = up ? 1 : -1
  return [
    box(0.5, 0.12, 0.34, x, y, z),
    box(0.06, 0.42, 0.3, x - 0.24, y + s * 0.24, z),
    box(0.06, 0.42, 0.3, x + 0.24, y + s * 0.24, z),
    place(new THREE.CylinderGeometry(0.19, 0.16, 0.46, 10), x, y + s * 0.36, z),
  ]
}

/** Sclipirile din lentilele reflectoarelor: puncte carora li se schimba culoarea in fiecare cadru. */
function lenses(positions) {
  const count = positions.length
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions.flatMap((p) => [p.x, p.y, p.z]), 3))
  const color = new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage)
  geo.setAttribute('aColor', color)
  const uniforms = { uDpr: { value: 1 } }
  const points = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      uniform float uDpr;
      varying vec3 vColor;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        vColor = aColor;
        gl_PointSize = clamp(150.0 * uDpr / -mv.z, 2.0 * uDpr, 26.0 * uDpr);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float r2 = dot(p, p);
        float a = exp(-r2 * 14.0) * 1.6 + exp(-r2 * 3.0) * 0.3;
        gl_FragColor = vec4(vColor * a, 1.0);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }))
  points.frustumCulled = false
  return { points, color, uniforms }
}

// Cele patru tablouri de lumini prin care trece scena, cate 16 batai fiecare.
// `aim` da, pentru reflectorul de la pozitia u (-1 stanga, 1 dreapta), cat se roteste si cat se ridica.
const LOOKS = [
  { color: new THREE.Color('#EAF6EC'), sky: 0.5, aim: (u, t) => [u * 0.7 + 0.07 * Math.sin(t * 0.4 + u * 2), 1.08 + 0.1 * Math.sin(t * 0.5 + u * 3)] },
  { color: new THREE.Color('#30D158'), sky: 0.3, aim: (u, t) => [-u * 0.85 + 0.14 * Math.sin(t * 0.7), 1.0 + 0.16 * Math.sin(t * 0.9 + u * 4)] },
  { color: new THREE.Color('#D3D8B2'), sky: 1, aim: (u, t) => [u * 0.5 + 0.22 * Math.sin(t * 0.35 + u * 1.5), 2.2 + 0.22 * Math.sin(t * 0.45 + u * 2)] },
  { color: new THREE.Color('#EAF6EC'), sky: 0.6, aim: (u, t) => [u * 0.45 + 0.8 * Math.sin(t * 0.55 + u * 0.6), 1.2 + 0.2 * Math.sin(t * 0.8 + u * 2.5)] },
]

const LED_TEXT = {
  logo: [['PING UP', '#F4F6F0', 0.46, 0.5]],
  mesh: [['PING UP', '#30D158', 0.42, 0.43], ['REȚEA PORNITĂ', '#D3D8B2', 0.13, 0.8]],
  nosignal: [['FĂRĂ SEMNAL', '#FF453A', 0.34, 0.5]],
  side: [['PING', '#F4F6F0', 0.2, 0.4], ['UP', '#30D158', 0.2, 0.62]],
  'side-off': [['SOS', '#FF453A', 0.2, 0.5]],
  eq: [],
}

export function createStages(quality, time) {
  const group = new THREE.Group()
  const dark = matte('#0B0E0C')
  const deckMat = matte('#121613', 0.8)
  const steel = metal('#2C342E', 0.42)
  const canvas = new THREE.MeshStandardMaterial({ color: '#0D110F', roughness: 0.95, side: THREE.DoubleSide })
  const shadow = new THREE.MeshBasicMaterial({ color: '#030504' })
  const edge = lit('#D3D8B2', 0.9)
  const batch = new Batch()

  // ---------- scena mare ----------
  const X = STAGE.x
  const F = STAGE.front
  const B = STAGE.back
  const W = STAGE.half
  const TOP = 18.6

  batch.add(deckMat, box(2 * W + 2.8, 1.8, F - B + 1.2, X, 0.9, (F + B) / 2 - 0.3))
  batch.add(edge, box(2 * W + 2.8, 0.07, 0.07, X, 1.78, F + 0.33))

  for (const sx of [-1, 1]) {
    for (const z of [F - 0.5, B + 0.3]) batch.add(steel, place(truss(TOP, 1.3), X + sx * (W + 1.4), 0, z))
    batch.add(steel, trussBetween(V(X + sx * (W + 1.4), TOP, B + 0.3), V(X + sx * (W + 1.4), TOP, F - 0.5), 1.1))
    // aripile cu ecranele laterale
    batch.add(steel, place(truss(13.8, 1), X + sx * (W + 10.3), 0, F - 1))
    batch.add(steel, trussBetween(V(X + sx * (W + 2), 13.8, F - 1), V(X + sx * (W + 10.8), 13.8, F - 1), 0.9))
  }
  for (const z of [F - 0.5, B + 0.3]) batch.add(steel, trussBetween(V(X - W - 2.4, TOP, z), V(X + W + 2.4, TOP, z), 1.3))
  batch.add(steel, trussBetween(V(X - W + 0.5, 15, F - 3.6), V(X + W - 0.5, 15, F - 3.6), 0.8))

  // acoperisul: o panza arcuita peste grinzile de sus
  const roofDepth = F - B + 2.6
  const roof = new THREE.PlaneGeometry(2 * W + 6, roofDepth, 18, 1)
  roof.rotateX(-Math.PI / 2)
  const rp = roof.attributes.position
  for (let i = 0; i < rp.count; i++) rp.setY(i, TOP + 0.85 + 2.5 * (1 - (rp.getX(i) / (W + 3)) ** 2))
  roof.translate(X, 0, (F + B) / 2 + 0.2)
  roof.computeVertexNormals()
  group.add(new THREE.Mesh(roof, canvas))

  // peretele din spate si rama ecranului
  batch.add(dark, box(27, 12.4, 0.4, X, 7.6, B + 0.9))
  for (const sx of [-1, 1]) batch.add(steel, box(0.28, 10.2, 0.3, X + sx * 12.2, 7.3, B + 1.25))
  batch.add(steel, box(24.7, 0.28, 0.3, X, 12.3, B + 1.25), box(24.7, 0.28, 0.3, X, 2.3, B + 1.25))

  const led = ledWall(24, 9.6, 150, time)
  led.mesh.position.set(X, 7.3, B + 1.3)
  group.add(led.mesh)

  const sideLeds = []
  for (const sx of [-1, 1]) {
    const s = ledWall(5.4, 8.2, 36, time)
    s.mesh.position.set(X + sx * (W + 6.2), 8.4, F - 0.9)
    s.mesh.rotation.y = -sx * 0.2
    group.add(s.mesh)
    sideLeds.push(s)
    batch.add(dark, box(5.9, 8.7, 0.3, X + sx * (W + 6.2), 8.4, F - 1.15, 0, -sx * 0.2))

    // boxele agatate: un sir care se curbeaza spre multime
    for (let k = 0; k < 9; k++) {
      const tilt = k * 0.042
      batch.add(dark, box(1.55, 0.58, 0.95, X + sx * (W + 3.2), 16.7 - k * 0.63 - k * k * 0.006, F + 0.9 - k * k * 0.014, tilt))
    }
    batch.add(steel, box(1.7, 0.18, 1.1, X + sx * (W + 3.2), 17.15, F + 0.9), box(0.1, 1.5, 0.1, X + sx * (W + 3.2), 17.9, F + 0.6))
  }

  // boxele de bas de pe jos si gardul din fata scenei
  for (let i = 0; i < 10; i++) batch.add(dark, box(2.25, 1.15, 1.5, X - 11.25 + i * 2.5, 0.575, F + 1.25))
  const bars = []
  for (let x = -22; x < 22; x += 2.4) {
    const cx = X + x + 1.2
    const z = STAGE.barrier
    bars.push(box(2.3, 0.07, 0.07, cx, 1.1, z), box(2.3, 0.07, 0.07, cx, 0.22, z), box(0.07, 1.1, 0.07, cx - 1.12, 0.55, z), box(0.07, 1.1, 0.07, cx + 1.12, 0.55, z))
    for (let k = -3; k <= 3; k++) bars.push(box(0.03, 0.82, 0.03, cx + k * 0.28, 0.66, z))
  }
  batch.add(metal('#414A44', 0.35), ...bars)

  // pupitrul, cu ecranul lui mic
  batch.add(dark, box(5.6, 1.2, 1.5, X, 2.4, F - 2.4), box(1.3, 0.5, 0.9, X - 4.6, 2.05, F - 1.6, -0.5), box(1.3, 0.5, 0.9, X + 4.6, 2.05, F - 1.6, -0.5))
  const booth = ledWall(5.4, 1, 54, time)
  booth.mesh.position.set(X, 2.4, F - 1.63)
  booth.uniforms.uEq.value = 1
  booth.uniforms.uRings.value = 0
  booth.show('eq', LED_TEXT.eq)
  group.add(booth.mesh)

  const figures = [performer(X, 1.8, F - 3.5, 1.75, 0), performer(X - 6.4, 1.8, F - 3.1, 1.66, 0.3), performer(X + 6.1, 1.8, F - 3.3, 1.7, -0.35)]
  group.add(new THREE.Mesh(merge(figures), shadow))

  // ---------- luminile scenei mari ----------
  const low = quality.low
  const frontAt = (low ? [-10, 0, 10] : [-12.5, -7.5, -2.5, 2.5, 7.5, 12.5]).map((x) => V(X + x, TOP - 1.25, F - 0.5))
  const skyAt = (low ? [-8, 8] : [-11.5, -4.5, 4.5, 11.5]).map((x) => V(X + x, 2.05, B + 2.3))
  const lensAt = [...frontAt.map((p) => p.clone().add(V(0, -0.6, 0.1))), ...skyAt.map((p) => p.clone().add(V(0, 0.62, 0)))]
  const heads = []
  for (const p of frontAt) heads.push(...fixture(p.x, p.y + 0.55, p.z))
  for (const p of skyAt) heads.push(...fixture(p.x, p.y - 0.2, p.z, true))
  for (let i = 0; i < 6; i++) heads.push(...fixture(X - 12.5 + i * 5, 14.45, F - 3.6))
  batch.add(metal('#1A1F1C', 0.5), ...heads)

  const front = frontAt.map((p) => {
    const m = beam(52, 0.17, 3.1, '#EAF6EC', time)
    m.position.copy(p).add(V(0, -0.55, 0.1))
    group.add(m)
    return m
  })
  const sky = skyAt.map((p) => {
    const m = beam(46, 0.15, 2.3, '#D3D8B2', time)
    m.position.copy(p).add(V(0, 0.6, 0))
    group.add(m)
    return m
  })
  const lens = lenses(lensAt)
  group.add(lens.points)

  // orbitoarele: doua randuri de lampi calde care bat din cand in cand spre multime
  const lamps = []
  const blinderGlow = []
  const blinderMat = lit('#FFD9A0', 0.08)
  for (const sx of [-1, 1]) {
    const cx = X + sx * 8.6
    batch.add(dark, box(3.5, 1.7, 0.3, cx, TOP - 2.6, F - 0.75))
    for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) lamps.push(place(new THREE.CircleGeometry(0.31, 14), cx - 1.2 + c * 0.8, TOP - 2.2 - r * 0.8, F - 0.58))
    const g = glow('#FFD9A0', 15, 0)
    g.position.set(cx, TOP - 2.6, F - 0.3)
    group.add(g)
    blinderGlow.push(g)
  }
  group.add(new THREE.Mesh(merge(lamps), blinderMat))

  // ceata luminata din jurul scenei
  const haze = [[-11, 9, F + 3, 34], [10, 7, F + 1, 30], [0, 12, B + 3, 44], [-4, 5, F + 9, 26], [14, 13, F - 2, 30]].map(([x, y, z, size], i) => {
    const s = glow('#BFE9CC', size, 0)
    s.position.set(X + x, y, z)
    s.userData = { x: X + x, y, phase: i * 1.7, size }
    group.add(s)
    return s
  })

  const wash = new THREE.PointLight('#DCE8DC', 0, 62, 1.7)
  wash.position.set(X, 13.5, F - 2.4)
  const back = new THREE.PointLight('#30D158', 0, 28, 1.8)
  back.position.set(X, 5, B + 3)
  group.add(wash, back)

  // ---------- scena 2: mai mica, cu fata spre vest ----------
  const x2 = STAGE2.x
  const z2 = STAGE2.z
  const h2 = STAGE2.half
  batch.add(deckMat, box(6, 1.4, 2 * h2 + 1.6, x2, 0.7, z2))
  batch.add(edge, box(0.07, 0.07, 2 * h2 + 1.6, x2 - 3.03, 1.38, z2))
  for (const sz of [-1, 1]) {
    batch.add(steel, place(truss(10.8, 1), x2 - 2.2, 0, z2 + sz * (h2 + 0.9)))
    batch.add(steel, place(truss(9.6, 0.9), x2 + 2.4, 0, z2 + sz * (h2 + 0.9)))
    batch.add(steel, trussBetween(V(x2 + 2.4, 9.6, z2 + sz * (h2 + 0.9)), V(x2 - 2.2, 10.8, z2 + sz * (h2 + 0.9)), 0.8))
    for (let k = 0; k < 4; k++) batch.add(dark, box(0.9, 0.55, 1.4, x2 - 2.3, 9.3 - k * 0.6, z2 + sz * (h2 - 0.4), 0, 0, -k * 0.05))
  }
  batch.add(steel, trussBetween(V(x2 - 2.2, 10.8, z2 - h2 - 1.4), V(x2 - 2.2, 10.8, z2 + h2 + 1.4), 1))
  const roof2 = new THREE.PlaneGeometry(6.4, 2 * h2 + 3.4)
  roof2.rotateX(-Math.PI / 2)
  roof2.rotateZ(-0.24)
  roof2.translate(x2 + 0.1, 10.75, z2)
  group.add(new THREE.Mesh(roof2, canvas))
  batch.add(dark, box(0.35, 6, 2 * h2, x2 + 2.75, 4.6, z2))
  const led2 = ledWall(11.4, 4.8, 72, time)
  led2.mesh.position.set(x2 + 2.5, 4.9, z2)
  led2.mesh.rotation.y = -Math.PI / 2
  group.add(led2.mesh)
  group.add(new THREE.Mesh(merge([performer(x2 + 0.6, 1.4, z2 - 1.2, 1.7, -Math.PI / 2), performer(x2 + 0.9, 1.4, z2 + 2.6, 1.66, -1.9)]), shadow))

  const beams2At = (low ? [-3.5, 3.5] : [-5, -1.7, 1.7, 5]).map((dz) => V(x2 - 2.2, 10.1, z2 + dz))
  const heads2 = []
  for (const p of beams2At) heads2.push(...fixture(p.x, p.y + 0.3, p.z))
  batch.add(metal('#1A1F1C', 0.5), ...heads2)
  const second = beams2At.map((p) => {
    const m = beam(34, 0.14, 2.3, '#D3D8B2', time)
    m.position.copy(p).add(V(0, -0.3, 0))
    group.add(m)
    return m
  })
  const lens2 = lenses(beams2At.map((p) => p.clone().add(V(-0.1, -0.3, 0))))
  group.add(lens2.points)
  const wash2 = new THREE.PointLight('#D3D8B2', 0, 30, 1.8)
  wash2.position.set(x2 - 1, 8, z2)
  group.add(wash2)

  batch.build(group)

  // ---------- miscarea ----------
  const state = { color: new THREE.Color('#EAF6EC'), level: 1, blind: 0 }
  const tint = new THREE.Color()
  const white = new THREE.Color('#EEF4EC')
  const red = new THREE.Color('#FF453A')
  let glitch = 0

  function update(t, dt, beat, s) {
    // la incarcare scena se aprinde pe rand: ecranul, apoi reflectoarele
    const on = (from, to) => smooth((t - from) / (to - from))
    const energy = s.stage

    const k = Math.floor(beat / 16)
    const cur = LOOKS[((k % 4) + 4) % 4]
    const prev = LOOKS[(((k - 1) % 4) + 4) % 4]
    const w = smooth((beat - k * 16) / 2)
    tint.copy(prev.color).lerp(cur.color, w)
    const pulse = Math.exp(-(beat - Math.floor(beat)) * 2.6)
    const skyLevel = prev.sky + (cur.sky - prev.sky) * w
    const blind = Math.exp(-(((beat % 32) + 32) % 32) * 0.85) * energy * on(1.2, 1.5)

    front.forEach((m, i) => {
      const u = front.length > 1 ? (i / (front.length - 1)) * 2 - 1 : 0
      const a = prev.aim(u, t)
      const b = cur.aim(u, t)
      aim(m, a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w)
      const level = (0.1 + 0.03 * pulse) * energy * on(0.9 + i * 0.16, 1.7 + i * 0.16)
      m.material.uniforms.uColor.value.copy(tint)
      m.material.uniforms.uIntensity.value = level
      lens.color.setXYZ(i, tint.r * level * 9, tint.g * level * 9, tint.b * level * 9)
    })
    sky.forEach((m, i) => {
      const u = sky.length > 1 ? (i / (sky.length - 1)) * 2 - 1 : 0
      aim(m, u * 0.5 + 0.2 * Math.sin(t * 0.25 + i), 2.78 + 0.16 * Math.sin(t * 0.3 + i * 1.3))
      const level = 0.07 * (0.3 + 0.7 * skyLevel) * energy * on(1.5 + i * 0.2, 2.5 + i * 0.2)
      m.material.uniforms.uIntensity.value = level
      lens.color.setXYZ(front.length + i, 0.83 * level * 9, 0.85 * level * 9, 0.7 * level * 9)
    })
    lens.color.needsUpdate = true

    blinderMat.color.set('#FFD9A0').multiplyScalar(0.06 + 2.4 * blind)
    for (const g of blinderGlow) g.material.opacity = 0.75 * blind

    for (const h of haze) {
      const u = h.userData
      h.position.x = u.x + Math.sin(t * 0.07 + u.phase) * 5
      h.position.y = u.y + Math.sin(t * 0.11 + u.phase * 2) * 1.2
      h.material.color.copy(tint).lerp(white, 0.5)
      h.material.opacity = (0.035 + 0.02 * pulse + 0.05 * blind) * energy * on(0.6, 2.6)
    }

    second.forEach((m, i) => {
      const u = second.length > 1 ? (i / (second.length - 1)) * 2 - 1 : 0
      aim(m, -Math.PI / 2 + u * 0.55 + 0.25 * Math.sin(t * 0.4 + i), 1.05 + 0.2 * Math.sin(t * 0.55 + i * 1.7))
      const level = 0.06 * energy * on(1.4, 2.6)
      m.material.uniforms.uIntensity.value = level
      lens2.color.setXYZ(i, 0.83 * level * 9, 0.85 * level * 9, 0.7 * level * 9)
    })
    lens2.color.needsUpdate = true

    // ecranele: mesajul capitolului, iar cand cade semnalul imaginea se rupe
    const dead = s.led === 'nosignal'
    glitch += ((dead ? 0.6 : 0) - glitch) * Math.min(1, dt * 6)
    const flicker = t < 1.1 ? (Math.sin(t * 47) > -0.2 ? 1 : 0.25) * on(0.35, 1.1) : 1
    led.show(s.led, LED_TEXT[s.led] ?? LED_TEXT.logo)
    led.uniforms.uBeat.value = beat
    led.uniforms.uGlitch.value = glitch
    led.uniforms.uBright.value = energy * s.led2 * flicker
    led.uniforms.uTint.value.copy(dead ? red : LOOKS[1].color)
    for (const sl of sideLeds) {
      sl.show(dead ? 'side-off' : 'side', LED_TEXT[dead ? 'side-off' : 'side'])
      sl.uniforms.uBeat.value = beat
      sl.uniforms.uGlitch.value = glitch
      sl.uniforms.uBright.value = energy * s.led2 * flicker
    }
    booth.uniforms.uBeat.value = beat
    booth.uniforms.uBright.value = energy * (0.5 + 0.5 * s.led2) * flicker * (1 - glitch)
    booth.uniforms.uTint.value.copy(tint)
    led2.show(dead ? 'nosignal' : 'logo', LED_TEXT[dead ? 'nosignal' : 'logo'])
    led2.uniforms.uBeat.value = beat
    led2.uniforms.uGlitch.value = glitch
    led2.uniforms.uBright.value = energy * 0.8

    const rise = on(0.6, 2.2)
    wash.intensity = 330 * energy * rise * (0.8 + 0.2 * pulse + 0.8 * blind)
    wash.color.copy(tint).lerp(white, 0.55)
    back.intensity = 150 * energy * rise
    wash2.intensity = 90 * energy * rise

    state.color.copy(tint).lerp(white, 0.5)
    state.level = energy * rise * (0.62 + 0.14 * pulse + 0.85 * blind)
    state.blind = blind
    return state
  }

  function setView(w, h, dpr) {
    lens.uniforms.uDpr.value = dpr
    lens2.uniforms.uDpr.value = dpr
  }

  return { group, update, setView }
}
