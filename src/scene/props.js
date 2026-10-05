// Restul festivalului: baruri, rulote cu mancare, cortul medical, portile, campingul, copacii, felinarele, gardul, antena.
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { Batch, box, glow, lightPoints, lit, matte, merge, metal, place, stringLights, strut, truss, trussBetween } from './kit.js'
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

/** Acoperis in doua ape, cu coama pe X. */
function gableRoof(w, d, y0, y1) {
  const A0 = [-w / 2, y0, -d / 2]
  const A1 = [w / 2, y0, -d / 2]
  const B0 = [-w / 2, y0, d / 2]
  const B1 = [w / 2, y0, d / 2]
  const R0 = [-w / 2, y1, 0]
  const R1 = [w / 2, y1, 0]
  return faces([A0, R0, R1, A0, R1, A1, B1, R1, R0, B1, R0, B0, A0, B0, R0, A1, R1, B1])
}

/** Roteste in jurul verticalei si muta la locul lui pe sol. */
function put(geo, x, z, ry = 0) {
  if (ry) geo.rotateY(ry)
  geo.translate(x, 0, z)
  return geo
}

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d'), w, h)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
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

function treeGeometry() {
  return merge([
    place(new THREE.CylinderGeometry(0.15, 0.24, 2.3, 6), 0, 1.15, 0),
    place(new THREE.IcosahedronGeometry(1.45, 1), 0, 3.3, 0),
    place(new THREE.IcosahedronGeometry(1.05, 1), 0.75, 2.65, 0.3),
    place(new THREE.IcosahedronGeometry(0.9, 1), -0.6, 3.75, -0.4),
  ])
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

  const dark = matte('#141815')
  const wood = matte('#2B241A', 0.85)
  const steel = metal('#2C342E', 0.45)
  const canopy = new THREE.MeshStandardMaterial({ color: '#232B24', roughness: 0.95, side: THREE.DoubleSide })
  const warm = lit('#FFC27A', 1.15)
  const sage = lit('#D3D8B2', 0.95)
  const white = lit('#F3F5EC', 1.2)
  const green = lit('#30D158', 1.2)

  // ---------- baruri: tejghea pe patru laturi, raftul din mijloc, acoperis in patru ape ----------
  const glows = []
  for (const b of LAYOUT.bars) {
    const along = b.d > b.w
    const L = along ? b.d : b.w
    const D = along ? b.w : b.d
    const ry = along ? Math.PI / 2 : 0
    const at = (g) => put(g, b.x, b.z, ry)
    batch.add(wood,
      at(box(L, 1.15, 0.5, 0, 0.575, D / 2 - 0.25)), at(box(L, 1.15, 0.5, 0, 0.575, -D / 2 + 0.25)),
      at(box(0.5, 1.15, D - 1, L / 2 - 0.25, 0.575, 0)), at(box(0.5, 1.15, D - 1, -L / 2 + 0.25, 0.575, 0)))
    batch.add(dark, at(box(L - 3.4, 2.15, 0.7, 0, 1.075, 0)))
    for (const sz of [-1, 1]) {
      batch.add(warm, at(box(L - 3.6, 0.05, 0.05, 0, 1.45, sz * 0.38)))
      batch.add(sage, at(box(L - 3.6, 0.05, 0.05, 0, 1.92, sz * 0.38)), at(box(L + 1.3, 0.05, 0.05, 0, 3.22, sz * (D / 2 + 0.55))))
      for (const sx of [-1, 0, 1]) batch.add(steel, at(box(0.13, 3.3, 0.13, sx * (L / 2 - 0.1), 1.65, sz * (D / 2 - 0.1))))
    }
    batch.add(canopy, at(hipRoof(L + 1.8, D + 1.8, 3.3, 4.75)))
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

  // ---------- cortul medical: deschis spre nord si spre vest, cu lumina aprinsa ----------
  const T = LAYOUT.tent
  const cloth = new THREE.MeshStandardMaterial({ color: '#8F977F', emissive: '#3C4436', emissiveIntensity: 0.4, roughness: 0.95, side: THREE.DoubleSide })
  const tentAt = (g) => put(g, T.x, T.z)
  batch.add(cloth,
    tentAt(gableRoof(T.w + 0.7, T.d + 0.7, 2.6, 4.05)),
    tentAt(box(T.w, 2.55, 0.07, 0, 1.275, T.d / 2)),
    tentAt(box(0.07, 2.55, T.d, T.w / 2, 1.275, 0)))
  for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) batch.add(steel, tentAt(box(0.14, 2.6, 0.14, sx * (T.w / 2 - 0.07), 1.3, sz * (T.d / 2 - 0.07))))
  batch.add(matte('#59614F'), tentAt(box(T.w - 0.3, 0.05, T.d - 0.3, 0, 0.025, 0)))
  batch.add(matte('#8E947F'),
    tentAt(box(0.85, 0.12, 2.05, 2.3, 0.55, 0.8)), tentAt(box(0.85, 0.12, 2.05, 3.5, 0.55, 0.8)),
    tentAt(box(1.5, 0.82, 0.7, -1.6, 0.41, 2.5)))
  batch.add(steel, tentAt(box(0.7, 0.5, 0.06, 2.3, 0.28, 0.8)), tentAt(box(0.7, 0.5, 0.06, 3.5, 0.28, 0.8)))
  // semnul de prim ajutor, pe un catarg in coltul dinspre multime
  const mastX = -T.w / 2 - 0.4
  const mastZ = -T.d / 2 - 0.4
  batch.add(steel, tentAt(strut(V(mastX, 0, mastZ), V(mastX, 6.6, mastZ), 0.07)))
  const cross = new THREE.MeshBasicMaterial({ map: crossTexture(), toneMapped: false })
  batch.add(cross,
    tentAt(place(new THREE.PlaneGeometry(1.6, 1.6), mastX, 5.8, mastZ - 0.06, 0, Math.PI)),
    tentAt(place(new THREE.PlaneGeometry(1.6, 1.6), mastX, 5.8, mastZ + 0.06)))
  const tentLamp = new THREE.PointLight('#F3F5EC', 46, 13, 1.8)
  tentLamp.position.set(T.x - 0.5, 2.9, T.z)
  group.add(tentLamp)
  const tentGlow = glow('#F3F5EC', 9, 0.4)
  tentGlow.position.set(T.x - 0.5, 2.6, T.z - 0.3)
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
    const m = new THREE.Mesh(new THREE.PlaneGeometry(bannerW, bannerW / 8), new THREE.MeshBasicMaterial({ map: textTexture(text, '#D3D8B2', '#121613'), toneMapped: false }))
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
  const forest = new THREE.InstancedMesh(treeGeometry(), matte('#0F1A13', 1), trees.length)
  trees.forEach(([x, z, s], i) => {
    dummy.position.set(x, 0, z)
    dummy.rotation.set(0, rand() * Math.PI * 2, 0)
    dummy.scale.set(s, s * (0.9 + rand() * 0.35), s)
    dummy.updateMatrix()
    forest.setMatrixAt(i, dummy.matrix)
  })
  group.add(forest)

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
