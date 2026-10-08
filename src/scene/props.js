// Restul festivalului: baruri, rulote cu mancare, cortul medical, portile, campingul, copacii, felinarele, gardul, antena.
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { Batch, box, canvasTexture, glow, lightPoints, lit, matte, merge, metal, place, stringLights, strut, truss, trussBetween } from './kit.js'
import { bounds, LAYOUT, meeting, pois, STAGE2, zone } from './world.js'

const V = (x, y, z) => new THREE.Vector3(x, y, z)

/** Geometrie din triunghiuri date punct cu punct, cu fetele plane. */
function faces(tris) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((tris.length) * 2), 2))
  g.computeVertexNormals()
  return g
}

/** Acoperis in patru ape peste un dreptunghi lung pe X: streasina la y0, coama la y1. */
function hipRoof(L, D, y0, y1) {
  const hx = L / 2
  const hz = D / 2
  const r = Math.max(0.01, hx - hz)
  const e = [[-hx, y0, -hz], [hx, y0, -hz], [hx, y0, hz], [-hx, y0, hz]]
  const a = [-r, y1, 0]
  const b = [r, y1, 0]
  return faces([e[0], a, b, e[0], b, e[1], e[2], b, a, e[2], a, e[3], e[1], b, e[2], e[3], a, e[0]])
}

/** Roteste in jurul verticalei si muta la locul lui pe sol. */
function put(geo, x, z, ry = 0) {
  if (ry) geo.rotateY(ry)
  geo.translate(x, 0, z)
  return geo
}

function textTexture(text, color, bg) {
  return canvasTexture(1024, 128, (g, w, h) => {
    g.fillStyle = bg
    g.fillRect(0, 0, w, h)
    g.fillStyle = color
    g.font = '800 92px Inter, system-ui, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(text, w / 2, h / 2 + 4)
  })
}

/** Fereastra unei rulote: lumina calda, rafturi si doi oameni care servesc. */
function serveryTexture() {
  return canvasTexture(256, 96, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, '#FFD08A')
    grad.addColorStop(1, '#F29A45')
    g.fillStyle = grad
    g.fillRect(0, 0, w, h)
    g.fillStyle = 'rgba(60,30,10,.45)'
    g.fillRect(0, 22, w, 4)
    for (let i = 0; i < 9; i++) g.fillRect(14 + i * 27, 8, 9, 14)
    g.fillStyle = '#1A130C'
    for (const x of [78, 176]) {
      g.beginPath()
      g.arc(x, 50, 13, 0, Math.PI * 2)
      g.fill()
      g.fillRect(x - 21, 62, 42, 40)
    }
  })
}

/** Semnul de prim ajutor: cruce alba pe verde. */
function crossTexture() {
  return canvasTexture(64, 64, (g) => {
    g.fillStyle = '#1E8238'
    g.fillRect(0, 0, 64, 64)
    g.fillStyle = '#fff'
    g.fillRect(26, 12, 12, 40)
    g.fillRect(12, 26, 40, 12)
  })
}

/**
 * Acoperisul de panza al unui cort, in doua ape (coama pe X): panza se lasa putin intre ferme si intre coama
 * si streasina, ca o panza intinsa, nu ca o placa.
 */
function tentRoof(L, half, eave, ridge, bays) {
  const NX = bays * 8
  const NT = 6
  const pos = []
  const uv = []
  for (const side of [-1, 1]) {
    const row = (i, j) => {
      const x = -L / 2 + (i / NX) * L
      const t = j / NT
      const sag = 0.08 * Math.sin(Math.PI * ((i / NX) * bays % 1)) * Math.sin(Math.PI * t)
      return [x, ridge - t * (ridge - eave) - sag, side * t * half]
    }
    // u merge in lungul cortului, v de la coama la streasina: dungile panzei urmeaza panta
    const at = (i, j) => [i / NX, j / NT]
    for (let i = 0; i < NX; i++) {
      for (let j = 0; j < NT; j++) {
        const a = row(i, j)
        const b = row(i + 1, j)
        const c = row(i + 1, j + 1)
        const d = row(i, j + 1)
        pos.push(...a, ...b, ...c, ...a, ...c, ...d)
        uv.push(...at(i, j), ...at(i + 1, j), ...at(i + 1, j + 1), ...at(i, j), ...at(i + 1, j + 1), ...at(i, j + 1))
      }
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.computeVertexNormals()
  return g
}

/** Bordura cortului medical: alba, cu dunga rosie jos, crucea verde si "PRIM AJUTOR". */
function tentValanceTexture() {
  return canvasTexture(1024, 64, (g, w, h) => {
    g.fillStyle = '#F2F3EE'
    g.fillRect(0, 0, w, h)
    g.fillStyle = '#C7302A'
    g.fillRect(0, h - 10, w, 10)
    g.font = '800 30px Inter, system-ui, sans-serif'
    g.textBaseline = 'middle'
    for (let x = 30; x < w; x += 340) {
      g.fillStyle = '#1E8238'
      g.fillRect(x, 13, 28, 28)
      g.fillStyle = '#fff'
      g.fillRect(x + 11, 17, 6, 20)
      g.fillRect(x + 4, 24, 20, 6)
      g.fillStyle = '#1B2A1F'
      g.fillText('PRIM AJUTOR', x + 40, h / 2 - 4)
    }
  })
}

/** Peretii cortului: panza cu cusaturi si doua ferestre de plastic, prin care se vede lumina dinauntru. */
function tentWallTexture() {
  return canvasTexture(512, 160, (g, w, h) => {
    g.fillStyle = '#ECEEE7'
    g.fillRect(0, 0, w, h)
    g.fillStyle = 'rgba(40,50,40,.08)'
    for (let x = 0; x < w; x += 64) g.fillRect(x, 0, 2, h)
    for (const x of [70, 300]) {
      g.fillStyle = '#C9D7D2'
      g.beginPath()
      g.roundRect(x, 34, 140, 62, 8)
      g.fill()
      g.strokeStyle = 'rgba(30,40,30,.25)'
      g.lineWidth = 3
      g.stroke()
    }
  })
}

/** Bordura barurilor: dungi verde inchis si crem, ca la corturile de festival. */
function barValanceTexture() {
  return canvasTexture(512, 32, (g, w, h) => {
    for (let x = 0; x < w; x += 32) {
      g.fillStyle = (x / 32) % 2 ? '#E7DFC6' : '#24402E'
      g.fillRect(x, 0, 32, h)
    }
    g.fillStyle = 'rgba(0,0,0,.25)'
    g.fillRect(0, h - 4, w, 4)
  })
}

/** Firma unui bar: litere calde aprinse pe un panou inchis. */
function barSignTexture() {
  return canvasTexture(512, 128, (g, w, h) => {
    g.fillStyle = '#14100B'
    g.fillRect(0, 0, w, h)
    g.strokeStyle = 'rgba(255,200,120,.45)'
    g.lineWidth = 4
    g.strokeRect(8, 8, w - 16, h - 16)
    g.fillStyle = '#FFC67A'
    g.font = '800 78px Inter, system-ui, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('BAR', w / 2, h / 2 + 4)
  })
}

/** Lipeste bucatile intr-o geometrie si coloreaza varfurile fiecareia: trunchiul maro, frunzisul verde. */
function painted(parts) {
  const colors = []
  for (const [g, hex] of parts) {
    const c = new THREE.Color(hex)
    for (let i = 0; i < g.attributes.position.count; i++) colors.push(c.r, c.g, c.b)
  }
  const geo = merge(parts.map(([g]) => g))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  return geo
}

/** Bulgar de frunzis: un icosaedru deformat, ca o coroana sa nu para facuta din sfere. */
function clump(r, x, y, z, seed) {
  const g = new THREE.IcosahedronGeometry(r, 1)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const vx = p.getX(i)
    const vy = p.getY(i)
    const vz = p.getZ(i)
    const k = 1 + 0.17 * Math.sin(vx * 4.1 + vz * 2.3 + seed * 7) * Math.sin(vy * 3.7 - vz * 1.9 + seed * 5)
    p.setXYZ(i, vx * k, vy * k * 0.9, vz * k)
  }
  g.computeVertexNormals()
  return place(g, x, y, z)
}

/** Copac cu frunze: trunchi care se ingusteaza, doua crengi si o coroana din mai multi bulgari. */
function leafyTree() {
  const bark = '#2A2118'
  const leaf = '#1B3524'
  const parts = [
    [place(new THREE.CylinderGeometry(0.1, 0.24, 2.7, 7), 0, 1.35, 0), bark],
    [place(new THREE.CylinderGeometry(0.04, 0.08, 1.3, 5), 0.42, 2.55, 0.1, 0, 0, -0.75), bark],
    [place(new THREE.CylinderGeometry(0.04, 0.07, 1.1, 5), -0.36, 2.7, -0.15, 0.3, 0, 0.8), bark],
  ]
  const blobs = [[1.45, 0, 3.55, 0], [1.05, 0.95, 3.0, 0.35], [1.0, -0.82, 3.1, -0.42], [1.0, 0.25, 4.4, -0.25], [0.9, -0.35, 2.8, 0.78], [0.82, 0.55, 3.75, 0.85]]
  blobs.forEach(([r, x, y, z], i) => parts.push([clump(r, x, y, z, i + 1), leaf]))
  return painted(parts)
}

/** Brad: trunchi scurt si patru etaje de ramuri, tot mai inguste spre varf. */
function pineTree() {
  const parts = [[place(new THREE.CylinderGeometry(0.08, 0.17, 1.5, 6), 0, 0.75, 0), '#241B13']]
  for (const [y, r, h] of [[1.0, 1.75, 2.3], [1.8, 1.38, 2.05], [2.6, 1.02, 1.8], [3.35, 0.64, 1.4]]) {
    parts.push([place(new THREE.ConeGeometry(r, h, 8, 1), 0, y + h / 2, 0), '#122A1C'])
  }
  return painted(parts)
}

/** Antena de telefonie de pe dealul din spatele scenei: zabrele, panouri, antene parabolice si becul rosu din varf. */
function tower(x, z) {
  const g = new THREE.Group()
  const base = 7.4
  const h = 38
  const mound = new THREE.Mesh(new THREE.SphereGeometry(48, 24, 10), matte('#0A0D0B'))
  mound.scale.set(1, 0.19, 0.8)
  mound.position.y = -1.4
  g.add(mound)
  const pts = []
  const legs = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
  const steps = 9
  for (let i = 0; i < 4; i++) {
    const [ax, az] = legs[i]
    const [bx, bz] = legs[(i + 1) % 4]
    for (let s = 0; s < steps; s++) {
      const y0 = base + (s / steps) * h
      const y1 = base + ((s + 1) / steps) * h
      const w0 = 2.7 * (1 - (s / steps) * 0.72)
      const w1 = 2.7 * (1 - ((s + 1) / steps) * 0.72)
      pts.push(ax * w0, y0, az * w0, ax * w1, y1, az * w1)
      pts.push(ax * w0, y0, az * w0, bx * w1, y1, bz * w1)
      pts.push(bx * w0, y0, bz * w0, ax * w1, y1, az * w1)
      pts.push(ax * w1, y1, az * w1, bx * w1, y1, bz * w1)
    }
  }
  const lattice = new THREE.BufferGeometry()
  lattice.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
  g.add(new THREE.LineSegments(lattice, new THREE.LineBasicMaterial({ color: '#66736A' })))
  const parts = []
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2
    parts.push(box(0.6, 3.4, 0.25, Math.cos(a) * 1.15, base + h - 2.6, Math.sin(a) * 1.15, 0, -a + Math.PI / 2))
  }
  parts.push(place(new THREE.CylinderGeometry(0.85, 0.85, 0.25, 16), -1.5, base + h - 8, 0.4, 0, 0, Math.PI / 2))
  parts.push(place(new THREE.CylinderGeometry(0.6, 0.6, 0.22, 16), 0.6, base + h - 11, -1.3, Math.PI / 2))
  parts.push(box(3.2, 2.2, 2.4, 3.6, base + 0.6, 2.2))
  g.add(new THREE.Mesh(merge(parts), metal('#1B211D', 0.6)))
  const lamp = glow('#FF453A', 9, 1)
  lamp.position.set(0, base + h + 0.8, 0)
  g.add(lamp)
  g.position.set(x, 0, z)
  return { group: g, lamp, top: V(x, base + h - 1, z) }
}

export function createProps(quality, rand, time) {
  const group = new THREE.Group()
  const batch = new Batch()
  /** Petele de lumina pe care constructiile le lasa pe sol: x, z, raza, culoare, tarie. */
  const spots = []
  const light = (x, z, r, color, a) => spots.push({ x, z, r, color, a })
  // panzele cu litere; se rescriu cand vine fontul
  const lettering = []

  const dark = matte('#141815')
  const wood = matte('#2B241A', 0.85)
  const steel = metal('#2C342E', 0.45)
  const canopy = new THREE.MeshStandardMaterial({ color: '#232B24', roughness: 0.95, side: THREE.DoubleSide })
  const warm = lit('#FFC27A', 1.15)
  const sage = lit('#D3D8B2', 0.95)
  const white = lit('#F3F5EC', 1.2)
  const green = lit('#30D158', 1.2)

  // ---------- baruri: corturi de panza, cu tejghea pe patru laturi, raftul din mijloc si firma aprinsa ----------
  const glows = []
  // Panza in dungi verde inchis si crem, ca la corturile de festival: fasii cusute una de alta, fiecare putin
  // bombata intre cusaturi. Culoarea si relieful vin din doua panze desenate la fel.
  const panels = (paint) => {
    const tex = canvasTexture(256, 8, (g, w, h) => {
      for (let k = 0; k < 2; k++) {
        const x0 = (k * w) / 2
        const grad = g.createLinearGradient(x0, 0, x0 + w / 2, 0)
        for (const [at, v] of [[0, 0], [0.5, 1], [1, 0]]) grad.addColorStop(at, paint(k, v))
        g.fillStyle = grad
        g.fillRect(x0, 0, w / 2, h)
        // cusatura, intre doua fasii
        g.fillStyle = paint(k, -1)
        g.fillRect(x0, 0, 2, h)
      }
    })
    tex.wrapS = THREE.RepeatWrapping
    tex.repeat.set(9, 1)
    tex.anisotropy = 8
    return tex
  }
  const cloth = [[216, 206, 180], [38, 66, 48]]
  const stripes = panels((k, v) => {
    const [r, gr, b] = cloth[k].map((c) => Math.round(c * (v < 0 ? 0.62 : 0.9 + 0.1 * v)))
    return `rgb(${r},${gr},${b})`
  })
  const relief = panels((k, v) => {
    const c = v < 0 ? 0 : Math.round(110 + 120 * v)
    return `rgb(${c},${c},${c})`
  })
  relief.colorSpace = THREE.NoColorSpace
  const barCanvas = new THREE.MeshStandardMaterial({ map: stripes, bumpMap: relief, bumpScale: 2.5, color: '#8E8775', roughness: 0.92, side: THREE.DoubleSide, emissive: '#FFD9A0', emissiveIntensity: 0.025 })
  const barValance = barValanceTexture()
  lettering.push(barValance)
  const barValanceMat = new THREE.MeshStandardMaterial({ map: barValance, roughness: 0.85, side: THREE.DoubleSide, emissive: '#FFFFFF', emissiveMap: barValance, emissiveIntensity: 0.12 })
  const barSign = barSignTexture()
  lettering.push(barSign)
  const barSignMat = new THREE.MeshBasicMaterial({ map: barSign, toneMapped: false, side: THREE.DoubleSide })
  const barAlu = metal('#8C9393', 0.35)
  for (const b of LAYOUT.bars) {
    const along = b.d > b.w
    const L = along ? b.d : b.w
    const D = along ? b.w : b.d
    const ry = along ? Math.PI / 2 : 0
    const at = (g) => put(g, b.x, b.z, ry)
    batch.add(wood,
      at(box(L, 1.15, 0.5, 0, 0.575, D / 2 - 0.25)), at(box(L, 1.15, 0.5, 0, 0.575, -D / 2 + 0.25)),
      at(box(0.5, 1.15, D - 1, L / 2 - 0.25, 0.575, 0)), at(box(0.5, 1.15, D - 1, -L / 2 + 0.25, 0.575, 0)))
    // blatul tejghelei, mai deschis, cu o margine peste lemn
    batch.add(matte('#3A3328', 0.55),
      at(box(L + 0.1, 0.06, 0.62, 0, 1.18, D / 2 - 0.25)), at(box(L + 0.1, 0.06, 0.62, 0, 1.18, -D / 2 + 0.25)))
    batch.add(dark, at(box(L - 3.4, 2.15, 0.7, 0, 1.075, 0)))
    for (const sz of [-1, 1]) {
      batch.add(warm, at(box(L - 3.6, 0.05, 0.05, 0, 1.45, sz * 0.38)))
      batch.add(sage, at(box(L - 3.6, 0.05, 0.05, 0, 1.92, sz * 0.38)), at(box(L + 1.3, 0.05, 0.05, 0, 3.22, sz * (D / 2 + 0.55))))
      for (const sx of [-1, 0, 1]) batch.add(barAlu, at(strut(V(sx * (L / 2 - 0.1), 0, sz * (D / 2 - 0.1)), V(sx * (L / 2 - 0.1), 3.3, sz * (D / 2 - 0.1)), 0.065, 8)))
      // firma aprinsa, agatata sub streasina, deasupra tejghelei
      batch.add(barSignMat, at(place(new THREE.PlaneGeometry(2.6, 0.62), 0, 2.78, sz * (D / 2 + 0.62), 0, sz < 0 ? Math.PI : 0)))
    }
    // acoperisul de panza, cu frontoane si bordura in dungi
    const half = (D + 1.8) / 2
    batch.add(barCanvas, at(tentRoof(L + 1.8, half, 3.3, 4.75, Math.max(2, Math.round(L / 4.5)))))
    for (const sx of [-1, 1]) batch.add(barCanvas, at(faces([[sx * (L + 1.8) / 2, 3.3, -half], [sx * (L + 1.8) / 2, 3.3, half], [sx * (L + 1.8) / 2, 4.75, 0]])))
    const VH = 0.36
    batch.add(barValanceMat,
      at(place(new THREE.PlaneGeometry(L + 1.8, VH), 0, 3.3 - VH / 2 + 0.02, -half, 0, Math.PI)),
      at(place(new THREE.PlaneGeometry(L + 1.8, VH), 0, 3.3 - VH / 2 + 0.02, half)),
      at(place(new THREE.PlaneGeometry(D + 1.8, VH), -(L + 1.8) / 2, 3.3 - VH / 2 + 0.02, 0, 0, -Math.PI / 2)),
      at(place(new THREE.PlaneGeometry(D + 1.8, VH), (L + 1.8) / 2, 3.3 - VH / 2 + 0.02, 0, 0, Math.PI / 2)))
    const g = glow('#FFD9A0', L * 0.95, 0.2)
    g.position.set(b.x, 2.3, b.z)
    group.add(g)
    glows.push(g)
    for (const k of [-0.32, 0.32]) light(b.x + (along ? 0 : k * L), b.z + (along ? k * L : 0), 7.5, '#E9DCA8', 0.5)
  }

  // ---------- rulotele cu mancare ----------
  const tones = ['#D3D8B2', '#E2A84B', '#C8643F', '#4FA79B']
  const awnings = tones.map((c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.22, roughness: 0.9, side: THREE.DoubleSide }))
  const signs = tones.map((c) => lit(c, 1.1))
  const body = matte('#1D231E', 0.7)
  const servery = new THREE.MeshBasicMaterial({ map: serveryTexture(), toneMapped: false })
  for (const t of LAYOUT.trucks) {
    const ry = t.face === 1 ? 0 : Math.PI
    const at = (g) => put(g, t.x, t.z, ry)
    batch.add(body,
      at(place(new RoundedBoxGeometry(4.3, 2.3, 2.3, 3, 0.2), -0.5, 1.8, 0)),
      at(place(new RoundedBoxGeometry(1.55, 1.75, 2.2, 3, 0.28), 2.5, 1.5, 0)),
      at(box(1.1, 0.3, 0.7, -1.2, 3.1, -0.3)))
    batch.add(dark, at(box(5.7, 0.26, 2, 0.1, 0.6, 0)))
    for (const [wx, wz] of [[-1.7, 1.02], [-1.7, -1.02], [2.4, 1.02], [2.4, -1.02]]) {
      batch.add(dark, at(place(new THREE.CylinderGeometry(0.43, 0.43, 0.28, 14), wx, 0.43, wz, Math.PI / 2)))
    }
    batch.add(servery, at(place(new THREE.PlaneGeometry(2.7, 0.98), -0.6, 2.08, 1.158)))
    batch.add(steel, at(box(2.95, 0.07, 0.42, -0.6, 1.53, 1.34)))
    batch.add(awnings[t.tone], at(place(new THREE.PlaneGeometry(3.15, 1.25), -0.6, 2.63, 1.76, -1.2)))
    batch.add(signs[t.tone], at(box(1.7, 0.46, 0.1, -0.6, 3.22, 1.02)))
    batch.add(sage, at(place(new THREE.PlaneGeometry(0.62, 0.86), 1.25, 2.02, 1.158)))
    light(t.x, t.z + t.face * 2.7, 5.6, '#FFC27A', 0.62)
  }
  // mesele dintre cele doua randuri si stalpii ghirlandelor
  const food = zone.food
  const midZ = (food.z0 + food.z1) / 2
  for (let i = 0; i < 7; i++) {
    const x = food.x0 + 6 + i * 5.6
    const z = midZ + (i % 2 ? 2.4 : -2.2)
    const ry = (i % 3) * 0.5
    const at = (g) => put(g, x, z, ry)
    batch.add(wood, at(box(2.4, 0.08, 0.85, 0, 0.8, 0)), at(box(2.4, 0.07, 0.3, 0, 0.46, 0.8)), at(box(2.4, 0.07, 0.3, 0, 0.46, -0.8)), at(box(0.1, 0.8, 1.7, 0.95, 0.4, 0)), at(box(0.1, 0.8, 1.7, -0.95, 0.4, 0)))
  }
  const strings = []
  for (let i = 0; i < 6; i++) {
    const x = food.x0 + 4 + i * 7.5
    const a = [x, 5.2, food.z0 + 6.5]
    const b = [x + 4, 5.2, food.z1 - 6.5]
    strings.push([a, b])
    batch.add(steel, strut(V(a[0], 0, a[2]), V(...a), 0.06), strut(V(b[0], 0, b[2]), V(...b), 0.06))
  }
  light((food.x0 + food.x1) / 2, midZ, 22, '#FFC27A', 0.22)

  // ---------- cortul medical: un cort de eveniment, deschis spre nord si spre vest, cu lumina aprinsa ----------
  const T = LAYOUT.tent
  const hw = T.w / 2
  const hd = T.d / 2
  const EAVE = 2.55
  const RIDGE = 3.9
  const tentAt = (g) => put(g, T.x, T.z)
  // panza alba lasa sa treaca putin din lumina dinauntru
  const canvasMat = new THREE.MeshStandardMaterial({ color: '#C9CDC4', roughness: 0.9, side: THREE.DoubleSide, emissive: '#FFF4E2', emissiveIntensity: 0.022 })
  const alu = metal('#AEB4B4', 0.32)
  batch.add(canvasMat, tentAt(tentRoof(T.w + 0.24, hd + 0.12, EAVE, RIDGE, 3)))
  // fronton spre est si spre vest, deasupra intrarii
  for (const sx of [-1, 1]) batch.add(canvasMat, tentAt(faces([[sx * hw, EAVE, -hd], [sx * hw, EAVE, hd], [sx * hw, RIDGE, 0]])))
  // peretii inchisi, cu ferestre: in spate (sud) si spre est
  const wallTex = tentWallTexture()
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, color: '#B9BDB4', roughness: 0.9, side: THREE.DoubleSide, emissive: '#FFF4E2', emissiveMap: wallTex, emissiveIntensity: 0.035 })
  batch.add(wallMat,
    tentAt(place(new THREE.PlaneGeometry(T.w, EAVE), 0, EAVE / 2, hd)),
    tentAt(place(new THREE.PlaneGeometry(T.d, EAVE), hw, EAVE / 2, 0, 0, Math.PI / 2)))
  // peretii laturilor deschise, rulati sub streasina
  batch.add(canvasMat,
    tentAt(place(new THREE.CylinderGeometry(0.1, 0.1, T.w - 0.2, 10, 1), 0, EAVE - 0.16, -hd - 0.04, 0, 0, Math.PI / 2)),
    tentAt(place(new THREE.CylinderGeometry(0.1, 0.1, T.d - 0.2, 10, 1), -hw - 0.04, EAVE - 0.16, 0, Math.PI / 2)))
  // bordura cu "PRIM AJUTOR" pe toate laturile
  const valance = tentValanceTexture()
  lettering.push(valance)
  const valanceMat = new THREE.MeshStandardMaterial({ map: valance, color: '#C9CCC4', roughness: 0.85, side: THREE.DoubleSide, emissive: '#FFFFFF', emissiveMap: valance, emissiveIntensity: 0.07 })
  const VH = 0.34
  batch.add(valanceMat,
    tentAt(place(new THREE.PlaneGeometry(T.w + 0.24, VH), 0, EAVE - VH / 2 + 0.02, -hd - 0.12, 0, Math.PI)),
    tentAt(place(new THREE.PlaneGeometry(T.w + 0.24, VH), 0, EAVE - VH / 2 + 0.02, hd + 0.12)),
    tentAt(place(new THREE.PlaneGeometry(T.d + 0.24, VH), -hw - 0.12, EAVE - VH / 2 + 0.02, 0, 0, -Math.PI / 2)),
    tentAt(place(new THREE.PlaneGeometry(T.d + 0.24, VH), hw + 0.12, EAVE - VH / 2 + 0.02, 0, 0, Math.PI / 2)))
  // structura de aluminiu: picioare, ferme, coama, cu saci de nisip la baza
  const bays = [-hw, -hw + T.w / 3, -hw + (2 * T.w) / 3, hw]
  for (const x of bays) {
    for (const z of [-hd, hd]) {
      batch.add(alu, tentAt(strut(V(x, 0, z), V(x, EAVE, z), 0.05, 8)), tentAt(strut(V(x, EAVE, z), V(x, RIDGE - 0.04, 0), 0.04, 6)))
      batch.add(matte('#1D1F1C', 0.95), tentAt(place(new RoundedBoxGeometry(0.42, 0.16, 0.28, 2, 0.06), x + (x < 0 ? 0.24 : -0.24), 0.08, z)))
    }
  }
  batch.add(alu, tentAt(strut(V(-hw, RIDGE - 0.04, 0), V(hw, RIDGE - 0.04, 0), 0.045, 6)))
  for (const z of [-hd, hd]) batch.add(alu, tentAt(strut(V(-hw, EAVE, z), V(hw, EAVE, z), 0.04, 6)))
  for (const x of [-hw, hw]) batch.add(alu, tentAt(strut(V(x, EAVE, -hd), V(x, EAVE, hd), 0.04, 6)))
  // lampa LED de sub coama
  batch.add(lit('#F7FAF2', 1.3), tentAt(box(T.w - 1.6, 0.05, 0.1, 0, RIDGE - 0.14, 0)))
  // inauntru: podea, doua targi, o masa cu trusa, scaune si un stativ de perfuzie
  batch.add(matte('#3A444C', 0.8), tentAt(box(T.w - 0.3, 0.04, T.d - 0.3, 0, 0.02, 0)))
  const mattress = matte('#2B6C92', 0.62)
  for (const cx of [hw - 1.5, hw - 3.2]) {
    batch.add(mattress, tentAt(place(new RoundedBoxGeometry(0.72, 0.12, 1.95, 2, 0.05), cx, 0.66, hd - 1.25)))
    batch.add(matte('#E6E8E2', 0.7), tentAt(place(new RoundedBoxGeometry(0.5, 0.09, 0.32, 2, 0.04), cx, 0.76, hd - 0.42)))
    for (const lx of [-0.3, 0.3]) for (const lz of [-0.85, 0.85]) batch.add(alu, tentAt(strut(V(cx + lx, 0, hd - 1.25 + lz), V(cx + lx, 0.6, hd - 1.25 + lz), 0.02, 5)))
  }
  const tx = -hw + 1.5
  const tz = hd - 0.7
  batch.add(matte('#DCDFD8', 0.55), tentAt(box(1.4, 0.04, 0.68, tx, 0.76, tz)))
  for (const lx of [-0.62, 0.62]) for (const lz of [-0.28, 0.28]) batch.add(alu, tentAt(strut(V(tx + lx, 0, tz + lz), V(tx + lx, 0.74, tz + lz), 0.018, 5)))
  batch.add(matte('#B4261E', 0.72), tentAt(place(new RoundedBoxGeometry(0.46, 0.28, 0.3, 2, 0.05), tx - 0.3, 0.92, tz)))
  batch.add(matte('#EDEEEA', 0.5), tentAt(place(new RoundedBoxGeometry(0.34, 0.2, 0.26, 2, 0.03), tx + 0.32, 0.88, tz + 0.04)))
  for (const [cx, cz, ry] of [[tx - 0.4, tz - 0.8, 0.2], [tx + 0.5, tz - 0.85, -0.25]]) {
    batch.add(matte('#26292B', 0.8),
      tentAt(put(box(0.44, 0.04, 0.42, 0, 0.46, 0), cx, cz, ry)),
      tentAt(put(box(0.44, 0.42, 0.04, 0, 0.7, 0.21), cx, cz, ry)))
    for (const lx of [-0.19, 0.19]) for (const lz of [-0.18, 0.18]) batch.add(alu, tentAt(put(strut(V(lx, 0, lz), V(lx, 0.45, lz), 0.014, 4), cx, cz, ry)))
  }
  const ivX = hw - 2.35
  const ivZ = hd - 2.0
  batch.add(alu, tentAt(strut(V(ivX, 0, ivZ), V(ivX, 1.95, ivZ), 0.018, 5)), tentAt(box(0.3, 0.02, 0.02, ivX, 1.9, ivZ)))
  batch.add(new THREE.MeshStandardMaterial({ color: '#CFE4EA', roughness: 0.2, transparent: true, opacity: 0.75 }), tentAt(place(new RoundedBoxGeometry(0.12, 0.2, 0.05, 2, 0.02), ivX + 0.12, 1.76, ivZ)))
  // semnul de prim ajutor: o caseta luminoasa pe catarg, in coltul dinspre multime
  const mastX = -hw - 0.5
  const mastZ = -hd - 0.5
  batch.add(alu, tentAt(strut(V(mastX, 0, mastZ), V(mastX, 6.3, mastZ), 0.06, 8)))
  batch.add(matte('#1D2420', 0.6), tentAt(place(new RoundedBoxGeometry(1.74, 1.74, 0.16, 2, 0.06), mastX, 5.6, mastZ)))
  const cross = new THREE.MeshBasicMaterial({ map: crossTexture(), toneMapped: false })
  batch.add(cross,
    tentAt(place(new THREE.PlaneGeometry(1.58, 1.58), mastX, 5.6, mastZ - 0.085, 0, Math.PI)),
    tentAt(place(new THREE.PlaneGeometry(1.58, 1.58), mastX, 5.6, mastZ + 0.085)))
  const tentLamp = new THREE.PointLight('#F3F5EC', 30, 12, 1.8)
  tentLamp.position.set(T.x - 0.3, 3.2, T.z)
  group.add(tentLamp)
  const tentGlow = glow('#F3F5EC', 7, 0.12)
  tentGlow.position.set(T.x - 0.5, 2.4, T.z - 0.3)
  group.add(tentGlow)
  light(T.x - 0.8, T.z - T.d / 2 - 1.2, 7.5, '#EEF3E2', 0.75)
  light(T.x - T.w / 2 - 1.4, T.z, 6.5, '#EEF3E2', 0.6)

  // ---------- portile: un portal de zabrele cu trei culoare ----------
  const G = LAYOUT.gates
  const gx0 = G.xs[0] - 6.5
  const gx1 = G.xs[G.xs.length - 1] + 6.5
  batch.add(steel,
    place(truss(8.6, 0.9), gx0, 0, G.z), place(truss(8.6, 0.9), gx1, 0, G.z),
    trussBetween(V(gx0 - 0.6, 8.6, G.z), V(gx1 + 0.6, 8.6, G.z), 0.9))
  const bannerW = 19
  batch.add(dark, box(bannerW + 0.5, 2.9, 0.16, (gx0 + gx1) / 2, 6.6, G.z))
  const banner = (text, facing) => {
    const tex = textTexture(text, '#D3D8B2', '#121613')
    lettering.push(tex)
    const m = new THREE.Mesh(new THREE.PlaneGeometry(bannerW, bannerW / 8), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }))
    m.position.set((gx0 + gx1) / 2, 6.6, G.z + facing * 0.09)
    if (facing < 0) m.rotation.y = Math.PI
    group.add(m)
  }
  banner('INTRARE', 1)
  banner('IEȘIRE', -1)
  for (const gx of G.xs) {
    for (const sx of [-1, 1]) {
      batch.add(dark, box(0.9, 1.25, 1.7, gx + sx * 2.6, 0.625, G.z))
      batch.add(green, box(0.3, 0.12, 0.3, gx + sx * 2.6, 1.32, G.z - 0.5))
    }
    light(gx, G.z - 1.5, 6, '#EEF3E2', 0.5)
  }

  // ---------- campingul ----------
  const camp = zone.camping
  const dome = new THREE.SphereGeometry(1, 9, 4, 0, Math.PI * 2, 0, Math.PI / 2)
  dome.scale(1.5, 1.05, 1.95)
  const tentColors = ['#2B5E45', '#8C9272', '#7A6A3A', '#3E6E78', '#A4553C', '#44505A']
  const where = []
  for (let z = camp.z0 + 4; z < camp.z1 - 3; z += 5.2) {
    for (let x = camp.x0 + 4; x < camp.x1 - 3; x += 5.4) {
      if (rand() < 0.14) continue
      where.push([x + (rand() - 0.5) * 2.4, z + (rand() - 0.5) * 2.2, rand() * Math.PI, 0.85 + rand() * 0.4, rand()])
    }
  }
  const litCount = where.filter((w) => w[4] < 0.17).length
  const tents = new THREE.InstancedMesh(dome, matte('#ffffff', 0.9), where.length - litCount)
  const lanterns = new THREE.InstancedMesh(dome, new THREE.MeshBasicMaterial({ color: new THREE.Color('#FFB868').multiplyScalar(0.55), toneMapped: false }), litCount)
  const dummy = new THREE.Object3D()
  const tint = new THREE.Color()
  let ti = 0
  let li = 0
  for (const [x, z, ry, s, pick] of where) {
    dummy.position.set(x, 0, z)
    dummy.rotation.set(0, ry, 0)
    dummy.scale.setScalar(s)
    dummy.updateMatrix()
    if (pick < 0.17) {
      lanterns.setMatrixAt(li++, dummy.matrix)
      light(x, z, 3.4, '#FFB868', 0.4)
    } else {
      tents.setMatrixAt(ti, dummy.matrix)
      tents.setColorAt(ti++, tint.set(tentColors[Math.floor(pick * 97) % tentColors.length]).multiplyScalar(0.55))
    }
  }
  group.add(tents, lanterns)

  // ---------- zona de relaxare: copaci, ghirlande, perne ----------
  const chill = zone.chill
  const grove = []
  for (let tries = 0; grove.length < 13 && tries < 400; tries++) {
    const x = chill.x0 + 4 + rand() * (chill.x1 - chill.x0 - 8)
    const z = chill.z0 + 3.5 + rand() * (chill.z1 - chill.z0 - 7)
    if (grove.every(([gx, gz]) => Math.hypot(gx - x, gz - z) > 7)) grove.push([x, z])
  }
  grove.sort((a, b) => a[0] - b[0])
  for (let i = 0; i + 1 < grove.length; i++) strings.push([[grove[i][0], 4.5, grove[i][1]], [grove[i + 1][0], 4.5, grove[i + 1][1]]])
  const bag = new THREE.SphereGeometry(0.62, 8, 6)
  bag.scale(1, 0.55, 1)
  const bags = new THREE.InstancedMesh(bag, matte('#ffffff', 1), 26)
  const bagColors = ['#8C9272', '#2B5E45', '#B38A3F', '#6E7A70']
  for (let i = 0; i < 26; i++) {
    const [gx, gz] = grove[i % grove.length]
    const a = rand() * Math.PI * 2
    dummy.position.set(gx + Math.cos(a) * (1.8 + rand() * 1.6), 0.3, gz + Math.sin(a) * (1.8 + rand() * 1.6))
    dummy.rotation.set(0, rand() * 3, 0)
    dummy.scale.setScalar(0.85 + rand() * 0.4)
    dummy.updateMatrix()
    bags.setMatrixAt(i, dummy.matrix)
    bags.setColorAt(i, tint.set(bagColors[i % bagColors.length]).multiplyScalar(0.5))
  }
  group.add(bags)
  light((chill.x0 + chill.x1) / 2, (chill.z0 + chill.z1) / 2, 20, '#FFC27A', 0.2)

  // ---------- copacii: in zona de relaxare si de jur imprejurul festivalului ----------
  const trees = []
  for (const [x, z] of grove) trees.push([x, z, 1.05 + rand() * 0.5])
  const ring = quality.low ? 90 : 170
  for (let i = 0; i < ring * 6 && trees.length < grove.length + ring; i++) {
    const side = Math.floor(rand() * 4)
    const far = 7 + Math.pow(rand(), 1.6) * 62
    const along = rand()
    let x
    let z
    if (side === 0) { x = bounds.x0 - 20 + along * (bounds.x1 - bounds.x0 + 40); z = bounds.z0 - far }
    else if (side === 1) { x = bounds.x0 - 20 + along * (bounds.x1 - bounds.x0 + 40); z = bounds.z1 + far }
    else if (side === 2) { x = bounds.x0 - far; z = bounds.z0 + along * (bounds.z1 - bounds.z0) }
    else { x = bounds.x1 + far; z = bounds.z0 + along * (bounds.z1 - bounds.z0) }
    // drumul spre intrare ramane liber
    if (side === 1 && x > gx0 - 4 && x < gx1 + 4) continue
    trees.push([x, z, 1.3 + rand() * 1.5])
  }
  // doua feluri de copaci, fiecare cu alt verde; brazii doar in jurul festivalului
  const isPine = (i) => i >= grove.length && Math.abs(Math.sin(i * 91.7) * 43758.5) % 1 < 0.38
  const foliage = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.95, envMapIntensity: 0.1 })
  const kinds = [leafyTree(), pineTree()].map((geo, k) => new THREE.InstancedMesh(geo, foliage, trees.filter((_, i) => isPine(i) === (k === 1)).length))
  const filled = [0, 0]
  const shade = new THREE.Color()
  trees.forEach(([x, z, s], i) => {
    const k = isPine(i) ? 1 : 0
    dummy.position.set(x, 0, z)
    dummy.rotation.set(0, rand() * Math.PI * 2, 0)
    dummy.scale.set(s, s * (0.9 + rand() * 0.35), s)
    dummy.updateMatrix()
    kinds[k].setMatrixAt(filled[k], dummy.matrix)
    const h = Math.abs(Math.sin(i * 12.7) * 9301.3) % 1
    kinds[k].setColorAt(filled[k]++, shade.setRGB(0.55 + 0.6 * h, 0.7 + 0.45 * h, 0.6 + 0.35 * (1 - h)))
  })
  group.add(...kinds)

  // ---------- felinarele de pe alei ----------
  const lampAt = []
  for (const z of [29.6, -15.5]) for (let x = -84; x <= 84; x += 28) lampAt.push([x, z + (z > 0 ? 3.6 : -3.4)])
  lampAt.push([-41.7, 7], [41.7, 7], [-21, 50], [3.2, 60])
  const heads = []
  for (const [x, z] of lampAt) {
    batch.add(steel, strut(V(x, 0, z), V(x, 7.2, z), 0.08), box(1.3, 0.07, 0.07, x + 0.6, 7.15, z))
    batch.add(white, box(0.7, 0.07, 0.3, x + 1.1, 7.08, z))
    heads.push(x + 1.1, 7.0, z)
    light(x + 1.1, z, 9.5, '#F2E3C0', 0.46)
  }
  const lamps = lightPoints(heads, lampAt.map(() => rand()), '#FFE9C4', 20, time)
  group.add(lamps.points)

  // ---------- punctele utile de pe harta ----------
  const poiLights = { water: [], exit: [], info: [] }
  const exitsAt = []
  for (const p of pois) {
    const [x, z] = p.at
    if (p.type === 'wc') {
      for (let k = -2; k <= 2; k++) {
        batch.add(matte('#26323A', 0.8), box(1.12, 2.3, 1.25, x + k * 1.28, 1.15, z))
        batch.add(sage, box(0.5, 0.05, 0.04, x + k * 1.28, 2.05, z + 0.64))
      }
      batch.add(dark, box(6.7, 0.1, 1.5, x, 2.35, z))
      light(x, z + 1.6, 4.5, '#D3D8B2', 0.4)
    } else if (p.type === 'water') {
      batch.add(steel, place(new THREE.CylinderGeometry(0.75, 0.75, 1.5, 14), x, 1.55, z), box(0.14, 0.8, 0.14, x - 0.5, 0.4, z), box(0.14, 0.8, 0.14, x + 0.5, 0.4, z), box(1.3, 0.1, 0.8, x, 0.85, z + 0.9))
      poiLights.water.push(x, 2.6, z)
      light(x, z, 3.6, '#7FC8E8', 0.4)
    } else if (p.type === 'info') {
      batch.add(dark, box(2.1, 2.5, 2.1, x, 1.25, z))
      batch.add(canopy, put(hipRoof(3, 3, 2.5, 3.3), x, z))
      batch.add(white, box(1.3, 0.5, 0.06, x, 1.9, z - 1.08))
      poiLights.info.push(x, 3.6, z)
      light(x, z - 2, 5, '#EEF3E2', 0.5)
    } else if (p.type === 'charge') {
      batch.add(dark, box(2.8, 2.1, 0.75, x, 1.05, z))
      for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) batch.add(green, box(0.07, 0.07, 0.03, x - 1.05 + c * 0.42, 0.55 + r * 0.6, z - 0.39))
      light(x, z - 1.6, 4, '#30D158', 0.3)
    } else if (p.type === 'exit') {
      const alongX = Math.abs(z - bounds.z0) < 8 || Math.abs(z - bounds.z1) < 8
      // poarta principala are deja portalul
      if (Math.abs(z - bounds.z1) < 8) continue
      const fx = alongX ? x : x < 0 ? bounds.x0 : bounds.x1
      const fz = alongX ? (z < 0 ? bounds.z0 : bounds.z1) : z
      const ry = alongX ? 0 : Math.PI / 2
      batch.add(steel, put(box(0.2, 3.4, 0.2, -2.2, 1.7, 0), fx, fz, ry), put(box(0.2, 3.4, 0.2, 2.2, 1.7, 0), fx, fz, ry), put(box(4.6, 0.25, 0.25, 0, 3.4, 0), fx, fz, ry))
      batch.add(green, put(box(1.6, 0.28, 0.08, 0, 3.05, 0), fx, fz, ry))
      poiLights.exit.push(fx, 3.4, fz)
      exitsAt.push([fx, fz])
      light(fx, fz, 5, '#30D158', 0.3)
    }
  }
  const poiPoints = [
    lightPoints(poiLights.water, poiLights.water.map(() => rand()), '#7FC8E8', 16, time),
    lightPoints(poiLights.exit, poiLights.exit.map(() => rand()), '#30D158', 16, time),
    lightPoints(poiLights.info, poiLights.info.map(() => rand()), '#F3F5EC', 16, time),
  ]
  for (const p of poiPoints) group.add(p.points)

  // ---------- punctul de intalnire: steagul ----------
  batch.add(steel, strut(V(meeting[0], 0, meeting[1]), V(meeting[0], 9, meeting[1]), 0.1))
  const flagGeo = new THREE.PlaneGeometry(3.4, 2, 12, 1)
  const flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ color: '#D3D8B2', emissive: '#565C48', side: THREE.DoubleSide, roughness: 0.8 }))
  flag.position.set(meeting[0] + 1.7, 7.9, meeting[1])
  group.add(flag)
  const flagBase = flagGeo.attributes.position.array.slice()
  light(meeting[0], meeting[1], 5, '#FF9F0A', 0.28)

  // ---------- gardul, cu loc liber la porti ----------
  const posts = []
  const rails = []
  const gap = (x, z) => (Math.abs(z - bounds.z1) < 0.01 && x > gx0 - 0.5 && x < gx1 + 0.5) || exitsAt.some(([ex, ez]) => Math.hypot(ex - x, ez - z) < 3.4)
  const run = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az)
    const n = Math.round(len / 5)
    for (let i = 0; i < n; i++) {
      const x0 = ax + ((bx - ax) * i) / n
      const z0 = az + ((bz - az) * i) / n
      const x1 = ax + ((bx - ax) * (i + 1)) / n
      const z1 = az + ((bz - az) * (i + 1)) / n
      if (gap((x0 + x1) / 2, (z0 + z1) / 2)) continue
      posts.push([x0, z0])
      for (const y of [0.9, 1.65]) rails.push(x0, y, z0, x1, y, z1)
    }
  }
  run(bounds.x0, bounds.z0, bounds.x1, bounds.z0)
  run(bounds.x1, bounds.z0, bounds.x1, bounds.z1)
  run(bounds.x1, bounds.z1, bounds.x0, bounds.z1)
  run(bounds.x0, bounds.z1, bounds.x0, bounds.z0)
  const fence = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 1.75, 0.1), steel, posts.length)
  posts.forEach(([x, z], i) => {
    dummy.position.set(x, 0.875, z)
    dummy.rotation.set(0, 0, 0)
    dummy.scale.setScalar(1)
    dummy.updateMatrix()
    fence.setMatrixAt(i, dummy.matrix)
  })
  const railGeo = new THREE.BufferGeometry()
  railGeo.setAttribute('position', new THREE.Float32BufferAttribute(rails, 3))
  group.add(fence, new THREE.LineSegments(railGeo, new THREE.LineBasicMaterial({ color: '#39423C' })))

  light(STAGE2.x - 9, STAGE2.z, 15, '#D3D8B2', 0.3)

  const bulbs = stringLights(strings, '#FFC27A', 14, rand, time)
  group.add(bulbs.points)

  const tw = tower(60, -150)
  group.add(tw.group)

  batch.build(group)

  return {
    group,
    spots,
    tower: tw,
    tentTop: V(T.x, 5.4, T.z),
    setView(dpr) {
      for (const p of [bulbs, lamps, ...poiPoints]) p.uniforms.uDpr.value = dpr
    },
    redrawText() {
      for (const tex of lettering) tex.userData.repaint()
    },
    update(t, s) {
      const p = flagGeo.attributes.position
      for (let i = 0; i < p.count; i++) {
        const x = flagBase[i * 3] + 1.7
        p.array[i * 3 + 2] = Math.sin(x * 1.6 - t * 3.2) * 0.22 * (x / 3.4)
      }
      p.needsUpdate = true
      tw.lamp.material.opacity = (0.35 + 0.65 * (Math.sin(t * 3.1) > 0 ? 1 : 0.15)) * s.towerLamp
    },
  }
}
