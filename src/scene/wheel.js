// Roata mare de dincolo de scena, peste copaci: doua jante pe spite, cabinele colorate atarnate de ele si sute de
// becuri care alearga pe janta in ritmul scenei. Se vede de departe, ca la festivalurile mari.
import * as THREE from 'three'
import { Batch, box, lit, metal, place, strut } from './kit.js'
import { WHEEL } from './world.js'

const V = (x, y, z) => new THREE.Vector3(x, y, z)

/** Culoare pe varfuri: cabinele, in culorile festivalului, intr-o singura plasa. */
function paint(geo, hex) {
  const c = new THREE.Color(hex)
  const n = geo.attributes.position.count
  const col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3)
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return geo
}

export function createWheel(quality, time) {
  const group = new THREE.Group()
  const batch = new Batch()
  // noaptea structura e o silueta; o desenteaza becurile
  const steel = metal('#3C4441', 0.45)
  const frame = metal('#252B28', 0.55)
  const cabin = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.25 })
  const { r, hub } = WHEEL
  const D = 1.15
  const SPOKES = 16

  // cele doua jante, cu spitele lor
  for (const z of [-D, D]) {
    const rim = new THREE.TorusGeometry(r, 0.16, 5, 72)
    batch.add(steel, place(rim, 0, hub, z))
    for (let i = 0; i < SPOKES; i++) {
      const a = (i / SPOKES) * Math.PI * 2
      batch.add(steel, strut(V(0, hub, z * 0.4), V(Math.cos(a) * r, hub + Math.sin(a) * r, z), 0.06, 5))
    }
  }
  // legaturile dintre jante si butucul
  for (let i = 0; i < SPOKES; i++) {
    const a = (i / SPOKES) * Math.PI * 2
    const x = Math.cos(a) * r
    const y = hub + Math.sin(a) * r
    batch.add(steel, strut(V(x, y, -D), V(x, y, D), 0.05, 5))
  }
  batch.add(frame, place(new THREE.CylinderGeometry(0.7, 0.7, 2.8, 14), 0, hub, 0, Math.PI / 2))

  // picioarele in A, de o parte si de alta, si platforma de jos
  for (const z of [-2.6, 2.6]) {
    for (const x of [-7.5, 7.5]) batch.add(frame, strut(V(x, 0, z * 1.6), V(0, hub, z * 0.55), 0.32, 8))
    batch.add(frame, strut(V(-4.4, hub * 0.42, z * 1.25), V(4.4, hub * 0.42, z * 1.25), 0.18, 6))
  }
  batch.add(frame, box(16, 0.6, 9, 0, 0.3, 0))
  batch.add(lit('#FFD9A0', 0.7), box(2.6, 0.9, 0.05, -4.5, 1.6, 4.52))
  batch.add(frame, box(3.4, 2.6, 2.2, -4.5, 1.6, 3.4))

  // cabinele: atarna drept, sub fiecare spita
  const tones = ['#2B5E45', '#D3D8B2', '#30D158', '#E2A84B', '#4FA79B', '#C8643F']
  for (let i = 0; i < SPOKES; i++) {
    const a = (i / SPOKES) * Math.PI * 2 + Math.PI / SPOKES
    const x = Math.cos(a) * r
    const y = hub + Math.sin(a) * r
    batch.add(cabin, paint(box(1.5, 1.5, 1.6, x, y - 1.35, 0), tones[i % tones.length]), paint(box(1.7, 0.18, 1.8, x, y - 0.52, 0), '#1B201D'))
    batch.add(frame, strut(V(x, y - 0.5, 0), V(x, y, 0), 0.05, 4))
  }
  const built = batch.build(new THREE.Group())

  // becurile: pe fiecare janta si pe fiecare spita; alearga in cerc, pe ritmul scenei
  const pos = []
  const ang = []
  const rad = []
  for (const z of [-D - 0.18, D + 0.18]) {
    for (let i = 0; i < 96; i++) {
      const a = (i / 96) * Math.PI * 2
      pos.push(Math.cos(a) * r, hub + Math.sin(a) * r, z)
      ang.push(a)
      rad.push(1)
    }
    for (let i = 0; i < SPOKES; i++) {
      const a = (i / SPOKES) * Math.PI * 2
      for (let k = 1; k <= 5; k++) {
        const f = k / 6
        pos.push(Math.cos(a) * r * f, hub + Math.sin(a) * r * f, z * (0.4 + 0.6 * f))
        ang.push(a)
        rad.push(f)
      }
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('aAng', new THREE.Float32BufferAttribute(ang, 1))
  geo.setAttribute('aRad', new THREE.Float32BufferAttribute(rad, 1))
  const uniforms = { uTime: time, uBeat: { value: 0 }, uDpr: { value: 1 }, uOn: { value: 1 } }
  const bulbs = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute float aAng;
      attribute float aRad;
      uniform float uTime, uBeat, uDpr, uOn;
      varying vec3 vCol;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        // un val care alearga pe janta si o pulsatie pe spite, la fiecare bataie
        float chase = smoothstep(0.55, 1.0, sin(aAng * 6.0 - uTime * 1.6));
        float pulse = exp(-fract(uBeat) * 3.0) * smoothstep(0.0, 0.2, aRad) * (1.0 - step(0.99, aRad));
        float k = 0.28 + 0.72 * max(chase * step(0.99, aRad), pulse * 0.8);
        vec3 green = vec3(0.19, 0.82, 0.35);
        vec3 warm = vec3(1.0, 0.93, 0.8);
        vCol = mix(warm, green, step(0.99, aRad) * (0.5 + 0.5 * sin(aAng * 3.0 + uTime * 0.4))) * k * uOn;
        gl_PointSize = clamp(420.0 * uDpr / -mv.z, 2.6 * uDpr, 10.0 * uDpr);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vCol;
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float a = exp(-dot(p, p) * 3.2);
        gl_FragColor = vec4(vCol * a * 3.2, 1.0);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }))
  bulbs.frustumCulled = false
  built.add(bulbs)

  built.position.set(WHEEL.x, 0, WHEEL.z)
  built.rotation.y = WHEEL.face
  group.add(built)

  return {
    group,
    setView(dpr) {
      uniforms.uDpr.value = dpr
    },
    update(beat) {
      uniforms.uBeat.value = beat
    },
  }
}
