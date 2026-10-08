// In spatele scenei mari: zona de productie, inchisa cu gard. Containerele cu birouri si cabine, autobuzele
// trupelor, camioanele cu echipamente, generatoarele, cortul de catering si turnurile mobile de lumina.
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { Batch, box, canvasTexture, lightPoints, lit, matte, merge, metal, place, strut } from './kit.js'
import { BACKSTAGE, STAGE } from './world.js'

const V = (x, y, z) => new THREE.Vector3(x, y, z)

/** Tabla ondulata a containerelor: dungi verticale, mai deschise si mai inchise. */
function corrugated() {
  const tex = canvasTexture(64, 8, (g, w, h) => {
    for (let x = 0; x < w; x++) {
      const v = 200 + 40 * Math.sin((x / w) * Math.PI * 2 * 4)
      g.fillStyle = `rgb(${v},${v},${v})`
      g.fillRect(x, 0, 1, h)
    }
  })
  tex.wrapS = THREE.RepeatWrapping
  tex.repeat.set(3, 1)
  return tex
}

/** Lumina pe sol, sub un turn de lumina: un cerc moale. */
function poolTexture() {
  return canvasTexture(128, 128, (g, w) => {
    const grad = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2)
    grad.addColorStop(0, 'rgba(255,240,215,.9)')
    grad.addColorStop(0.35, 'rgba(255,236,205,.34)')
    grad.addColorStop(1, 'rgba(255,236,205,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, w, w)
  })
}

/** Culoare pe varfuri: piesele vopsite stau toate intr-o singura plasa. */
function paint(geo, hex) {
  const c = new THREE.Color(hex)
  const n = geo.attributes.position.count
  const col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3)
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return geo
}

/** Pune o piesa la locul ei: rotita cu `ry` in jurul verticalei si mutata in (x, z). */
const at = (geo, x, z, ry = 0) => {
  if (ry) geo.rotateY(ry)
  return geo.translate(x, 0, z)
}

export function createBackstage(quality, time) {
  const group = new THREE.Group()
  const batch = new Batch()
  const painted = new THREE.MeshStandardMaterial({ vertexColors: true, map: corrugated(), roughness: 0.75, metalness: 0.2, envMapIntensity: 0.4 })
  const smooth = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.3, envMapIntensity: 0.6 })
  const dark = matte('#0A0C0B', 0.9)
  const steel = metal('#6F7774', 0.4)
  const glass = new THREE.MeshStandardMaterial({ color: '#0B1116', roughness: 0.15, metalness: 0.5, envMapIntensity: 1 })
  const warm = lit('#FFCF8E', 0.85)
  const cool = lit('#9DB8D6', 0.32)
  const lamps = lit('#FFF6E4', 2.2)
  const B = STAGE.back

  // ---------- cutiile de transport din spatele scenei ----------
  for (let i = 0; i < 9; i++) {
    const x = -11 + i * 2.7 + (i % 3) * 0.3
    const h = i % 3 === 1 ? 2 : 1
    for (let k = 0; k < h; k++) {
      const tone = (i + k) % 2 ? '#2A2D2C' : '#1D201F'
      batch.add(smooth, paint(box(1.3, 0.95, 0.85, x, 0.475 + k * 0.95, B - 2.3), tone))
      batch.add(steel, box(1.32, 0.05, 0.87, x, 0.95 + k * 0.95, B - 2.3))
    }
  }

  // ---------- containerele: cabinele artistilor jos, biroul productiei deasupra ----------
  const CW = 6.06
  const CH = 2.59
  const CD = 2.44
  const boxes = [[-13, 0, '#2F3D36'], [-6.6, 0, '#4B524E'], [0, 0, '#2E3A47'], [6.6, 0, '#4B524E'], [-13, 1, '#57605B'], [-6.6, 1, '#2F3D36']]
  const zc = B - 8
  for (const [x, level, tone] of boxes) {
    const y = level * CH
    batch.add(painted, paint(box(CW, CH, CD, x, y + CH / 2, zc), tone))
    // usa si ferestrele spre scena, aprinse
    batch.add(dark, box(0.95, 2.05, 0.06, x - 2.2, y + 1.05, zc + CD / 2 + 0.02))
    batch.add(warm, box(1.1, 0.7, 0.04, x + 0.2, y + 1.55, zc + CD / 2 + 0.03), box(1.1, 0.7, 0.04, x + 1.8, y + 1.55, zc + CD / 2 + 0.03))
  }
  // scara si balustrada pana la birou
  batch.add(steel, strut(V(-17.2, 0, zc + 1.6), V(-16.2, CH, zc + 1.6), 0.06, 5), strut(V(-17.2, 0, zc + 0.7), V(-16.2, CH, zc + 0.7), 0.06, 5))
  for (let k = 1; k < 7; k++) batch.add(steel, box(0.9, 0.05, 0.28, -17.2 + k * 0.143, k * 0.37, zc + 1.15))
  batch.add(steel, strut(V(-16.2, CH + 1, zc + 1.4), V(-3.6, CH + 1, zc + 1.4), 0.03, 5))

  // ---------- autobuzele trupelor, cu geamurile fumurii luminate dinauntru ----------
  for (const [x, z, ry, tone] of [[-29, B - 6.5, 0, '#14181A'], [30, B - 7, Math.PI, '#20262B']]) {
    const bus = (g) => at(g, x, z, ry)
    batch.add(smooth, paint(bus(place(new RoundedBoxGeometry(12.8, 3.4, 2.55, 2, 0.25), 0, 2.05, 0)), tone))
    batch.add(glass, bus(box(11.4, 0.95, 2.58, -0.3, 2.85, 0)), bus(box(0.06, 1.5, 2.2, 6.42, 2.4, 0)))
    batch.add(cool, bus(box(10.6, 0.5, 2.6, -0.5, 2.9, 0)))
    for (const wx of [-4.6, -3.2, 4.6]) for (const wz of [-1.18, 1.18]) batch.add(dark, bus(place(new THREE.CylinderGeometry(0.52, 0.52, 0.32, 12), wx, 0.52, wz, Math.PI / 2)))
  }

  // ---------- camioanele cu echipamente: remorca lunga si cabina ----------
  // remorcile sunt albe ziua; noaptea, departe de lumini, raman gri
  const trucks = [[-16, B - 17, 0.22, '#7D8481'], [4, B - 19.5, -0.08, '#5E6562'], [22, B - 16, -0.32, '#868C89']]
  for (const [x, z, ry, tone] of trucks) {
    const tr = (g) => at(g, x, z, ry)
    batch.add(smooth, paint(tr(box(13.6, 2.75, 2.55, -1.5, 2.6, 0)), tone))
    batch.add(dark, tr(box(13.2, 0.35, 1.2, -1.5, 1.05, 0)))
    batch.add(smooth, paint(tr(place(new RoundedBoxGeometry(2.3, 2.6, 2.5, 2, 0.2), 6.6, 2.25, 0)), '#1E2B3A'))
    batch.add(glass, tr(box(0.06, 1, 2.2, 7.77, 2.85, 0)))
    for (const wx of [-7.2, -6.1, -5, 6.9]) for (const wz of [-1.1, 1.1]) batch.add(dark, tr(place(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 12), wx, 0.5, wz, Math.PI / 2)))
  }

  // ---------- generatoarele: cutii insonorizate cu tobe de esapament ----------
  for (const [x, z] of [[36, B - 20], [36, B - 24.2]]) {
    batch.add(painted, paint(box(6, 2.6, 2.4, x, 1.3, z, 0, Math.PI / 2), '#3B4A3F'))
    batch.add(steel, strut(V(x + 0.5, 2.6, z - 1.8), V(x + 0.5, 3.5, z - 1.8), 0.13, 8))
    batch.add(dark, box(2.42, 0.6, 0.06, x, 1.7, z + 0, 0, Math.PI / 2))
  }

  // ---------- cortul de catering: panza alba, lumina calda dinauntru ----------
  const tent = new THREE.MeshStandardMaterial({ color: '#C9CDC4', roughness: 0.9, side: THREE.DoubleSide, emissive: '#FFE9C6', emissiveIntensity: 0.22 })
  const tx = -33
  const tz = B - 18
  batch.add(tent, box(8, 2.4, 6, tx, 1.2, tz))
  const roof = (side) => place(new THREE.PlaneGeometry(8.2, 3.5), tx, 3.05, tz + side * 1.5, -Math.PI / 2 + side * 0.55)
  batch.add(tent, roof(1), roof(-1))

  // ---------- turnurile mobile de lumina: catarg, patru lampi, lumina pe sol ----------
  const towers = [[-24, B - 11, 0.4], [13, B - 10.5, -0.3], [30, B - 20.5, 0.9]]
  const halos = []
  const pools = []
  for (const [x, z, ry] of towers) {
    const t = (g) => at(g, x, z, ry)
    batch.add(painted, paint(t(box(2.4, 1, 1.5, 0, 0.75, 0)), '#C49A2C'))
    batch.add(steel, t(strut(V(0, 1.2, 0), V(0, 8.6, 0), 0.08, 6)), t(box(1.9, 0.12, 0.12, 0, 8.7, 0)))
    for (const dx of [-0.7, -0.24, 0.24, 0.7]) {
      batch.add(dark, t(box(0.4, 0.34, 0.24, dx, 8.95, 0.05, -0.5)))
      batch.add(lamps, t(box(0.34, 0.28, 0.02, dx, 8.93, 0.18, -0.5)))
      const p = V(dx, 8.95, 0.25).applyAxisAngle(V(0, 1, 0), ry).add(V(x, 0, z))
      halos.push(p.x, p.y, p.z)
    }
    pools.push(place(new THREE.PlaneGeometry(18, 18), x + Math.sin(ry) * 4, 0.04, z + Math.cos(ry) * 4, -Math.PI / 2))
  }
  const halo = lightPoints(halos, Array.from({ length: halos.length / 3 }, (_, i) => i * 0.37), '#FFF1DA', 13, time)
  group.add(halo.points)
  const pool = new THREE.Mesh(merge(pools), new THREE.MeshBasicMaterial({ map: poolTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0.32 }))
  pool.renderOrder = 2
  group.add(pool)

  // ---------- gardul: panouri cu plasa neagra, pe trei laturi ----------
  const scrim = matte('#0D100F', 0.97)
  const fence = []
  const posts = []
  const { x0, x1, z0, z1 } = BACKSTAGE
  for (let z = z1; z > z0; z -= 3.5) {
    for (const x of [x0, x1]) {
      fence.push(place(new THREE.PlaneGeometry(3.45, 2), x, 1, z - 1.75, 0, Math.PI / 2))
      posts.push(strut(V(x, 0, z), V(x, 2.1, z), 0.04, 4))
    }
  }
  for (let x = x0; x < x1; x += 3.5) {
    fence.push(place(new THREE.PlaneGeometry(3.45, 2), x + 1.75, 1, z0))
    posts.push(strut(V(x, 0, z0), V(x, 2.1, z0), 0.04, 4))
  }
  scrim.side = THREE.DoubleSide
  batch.add(scrim, ...fence)
  batch.add(steel, ...posts)

  batch.build(group)

  return {
    group,
    setView(dpr) {
      halo.uniforms.uDpr.value = dpr
    },
  }
}
