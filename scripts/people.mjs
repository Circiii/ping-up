// Oamenii din multime: personaje Microsoft Rocketbox (MIT), puse in pozele de la concert, cu telefonul ridicat,
// simplificate pe trepte de detaliu. Ies doua fisiere mici: src/scene/people.dat (geometria, gzip) si
// src/scene/people.webp (hainele, fetele si parul tuturor, intr-un singur atlas).
// Folosire: npm run people   (modelele se descarca o singura data, in node_modules/.cache/people; atlasul il scrie
// ImageMagick, `magick`, care trebuie sa fie instalat)
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { MeshoptSimplifier } from 'meshoptimizer'
import * as THREE from 'three'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

const site = fileURLToPath(new URL('..', import.meta.url))
const CACHE = resolve(site, 'node_modules/.cache/people/rocketbox')
const OUT = resolve(site, 'src/scene/people.dat')
const ATLAS = resolve(site, 'src/scene/people.webp')
const REPO = 'https://raw.githubusercontent.com/microsoft/Microsoft-Rocketbox/master/Assets'

// Oameni in haine de festival, din https://github.com/microsoft/Microsoft-Rocketbox (MIT)
const CHARACTERS = [
  { id: 'party', dir: 'Female_Party_01', tex: 'f010', sex: 'f' },
  { id: 'party2', dir: 'Female_Party_02', tex: 'f022', sex: 'f' },
  { id: 'hoodiegirl', dir: 'Female_Adult_12', tex: 'f012', sex: 'f' },
  { id: 'greentee', dir: 'Female_Adult_17', tex: 'f006', sex: 'f' },
  { id: 'tank', dir: 'Female_Adult_03', tex: 'f003', sex: 'f' },
  { id: 'graytee', dir: 'Female_Adult_08', tex: 'f008', sex: 'f' },
  { id: 'polo', dir: 'Male_Adult_01', tex: 'm002', sex: 'm' },
  { id: 'navy', dir: 'Male_Adult_09', tex: 'm017', sex: 'm' },
  { id: 'bluetee', dir: 'Male_Adult_16', tex: 'm019', sex: 'm' },
  { id: 'track', dir: 'Male_Adult_17', tex: 'm022', sex: 'm' },
  { id: 'hoodie', dir: 'Male_Adult_18', tex: 'm023', sex: 'm' },
  { id: 'redsleeve', dir: 'Male_Adult_06', tex: 'm011', sex: 'm' },
]
// miscarile din aceeasi biblioteca: din ele vin poza de repaus a fiecaruia si pasul celui care merge
const CLIPS = {
  f: { idle: 'static/f_idle_neutral_01', walk: 'xy/f_walk_neutral_01' },
  m: { idle: 'static/m_idle_neutral_01', walk: 'xy/m_walk_neutral_01' },
}

// Rolurile varfurilor: dupa ele, scena da unora alte haine si stie unde e parul si telefonul.
const ROLE = { top: 0, skin: 1, hair: 2, screen: 3, bottom: 4, shoes: 5, dark: 6 }
const MAT = { body: 0, head: 1, hair: 2 }

// Trepte de detaliu, in triunghiuri (corp si cap): de aproape, din multime si de departe. Parul din suvite apare
// doar de aproape; mai departe ramane cel pictat pe cap.
const LODS = [950, 220, 80]
const HAIR = 130

// Atlasul: pentru fiecare om, corpul (256 px), capul si parul (cate 128 px), patru oameni pe rand.
const SLOT = { w: 256, h: 384 }
const COLS = 4

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)

// ---------------------------------------------------------------- fisierele

async function cached(url, name, optional = false) {
  mkdirSync(CACHE, { recursive: true })
  const path = resolve(CACHE, name)
  const none = `${path}.none`
  if (optional && existsSync(none)) return null
  if (!existsSync(path)) {
    const res = await fetch(url)
    if (res.status === 404 && optional) {
      writeFileSync(none, '')
      return null
    }
    if (!res.ok) throw new Error(`${url}: ${res.status}`)
    writeFileSync(path, Buffer.from(await res.arrayBuffer()))
  }
  return readFileSync(path)
}

// FBXLoader ar incarca si texturile prin DOM; aici le citim separat, din TGA
THREE.TextureLoader.prototype.load = () => new THREE.Texture()
const quiet = console.warn
function parseFbx(buf) {
  console.warn = () => {}
  try {
    return new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '')
  } finally {
    console.warn = quiet
  }
}

/** TGA truecolor (necomprimat sau RLE), intors cu randurile de sus in jos, in RGBA. */
function decodeTga(buf) {
  const idLen = buf[0]
  const type = buf[2]
  const w = buf.readUInt16LE(12)
  const h = buf.readUInt16LE(14)
  const bpp = buf[16] / 8
  if (buf[1] !== 0 || (type !== 2 && type !== 10) || (bpp !== 3 && bpp !== 4)) throw new Error('TGA: doar truecolor pe 24 sau 32 de biti')
  const topDown = (buf[17] & 0x20) !== 0
  const out = new Uint8Array(w * h * 4)
  const put = (i, at) => {
    const x = i % w
    const y = (i - x) / w
    const o = ((topDown ? y : h - 1 - y) * w + x) * 4
    out[o] = buf[at + 2]
    out[o + 1] = buf[at + 1]
    out[o + 2] = buf[at]
    out[o + 3] = bpp === 4 ? buf[at + 3] : 255
  }
  let at = 18 + idLen
  if (type === 2) {
    for (let i = 0; i < w * h; i++, at += bpp) put(i, at)
  } else {
    for (let i = 0; i < w * h; ) {
      const head = buf[at++]
      const n = (head & 0x7f) + 1
      if (head & 0x80) {
        for (let k = 0; k < n; k++) put(i++, at)
        at += bpp
      } else {
        for (let k = 0; k < n; k++, at += bpp) put(i++, at)
      }
    }
  }
  return { width: w, height: h, data: out }
}

/** Micsorare prin medie pe blocuri; culoarea se mediaza ponderat cu opacitatea, ca marginile parului sa nu se innegreasca. */
function shrink(img, size) {
  const k = img.width / size
  const out = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let j = 0; j < k; j++) {
        for (let i = 0; i < k; i++) {
          const o = ((y * k + j) * img.width + x * k + i) * 4
          const w = img.data[o + 3]
          r += img.data[o] * w
          g += img.data[o + 1] * w
          b += img.data[o + 2] * w
          a += w
        }
      }
      const o = (y * size + x) * 4
      if (a > 0) out.set([r / a, g / a, b / a, a / (k * k)], o)
    }
  }
  return { width: size, height: size, data: out }
}

/**
 * Pixelii pe care nu cade niciun triunghi primesc culoarea celui mai apropiat pixel folosit: la distanta, cand
 * placa video amesteca pixelii vecini, marginile hainelor nu mai iau negrul din jur.
 */
function bleed(img, used) {
  const n = img.width * img.height
  const queue = new Int32Array(n)
  let head = 0
  let tail = 0
  const seen = Uint8Array.from(used)
  for (let i = 0; i < n; i++) if (seen[i]) queue[tail++] = i
  while (head < tail) {
    const i = queue[head++]
    const x = i % img.width
    const y = (i - x) / img.width
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= img.width || ny >= img.height) continue
      const j = ny * img.width + nx
      if (seen[j]) continue
      seen[j] = 1
      img.data.copyWithin(j * 4, i * 4, i * 4 + 3)
      queue[tail++] = j
    }
  }
}

/** Ce pixeli ai texturii (de marimea `size`) sunt acoperiti de triunghiurile date, cu un pixel in plus pe margine. */
function coverage(size, tris) {
  const used = new Uint8Array(size * size)
  for (const [a, b, c] of tris) {
    const xs = [a[0], b[0], c[0]].map((u) => u * size)
    const ys = [a[1], b[1], c[1]].map((v) => (1 - v) * size)
    const x0 = Math.max(0, Math.floor(Math.min(...xs)) - 1)
    const x1 = Math.min(size - 1, Math.ceil(Math.max(...xs)) + 1)
    const y0 = Math.max(0, Math.floor(Math.min(...ys)) - 1)
    const y1 = Math.min(size - 1, Math.ceil(Math.max(...ys)) + 1)
    const area = (xs[1] - xs[0]) * (ys[2] - ys[0]) - (xs[2] - xs[0]) * (ys[1] - ys[0])
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (Math.abs(area) < 1e-9) {
          used[y * size + x] = 1
          continue
        }
        const px = x + 0.5
        const py = y + 0.5
        const w0 = ((xs[1] - px) * (ys[2] - py) - (xs[2] - px) * (ys[1] - py)) / area
        const w1 = ((xs[2] - px) * (ys[0] - py) - (xs[0] - px) * (ys[2] - py)) / area
        const w2 = 1 - w0 - w1
        // un pixel de toleranta: si pixelii atinsi doar de margine raman ai triunghiului
        const tol = 1.5 / Math.max(1, Math.sqrt(Math.abs(area)))
        if (w0 >= -tol && w1 >= -tol && w2 >= -tol) used[y * size + x] = 1
      }
    }
  }
  return used
}

// ---------------------------------------------------------------- poza

const worldPos = (o) => o.getWorldPosition(v3())

/** Roteste osul ca directia `from` (din lume) sa ajunga `to`. */
function turn(b, from, to) {
  const q = new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), to.clone().normalize())
  const world = b.getWorldQuaternion(new THREE.Quaternion())
  const parent = b.parent.getWorldQuaternion(new THREE.Quaternion())
  b.quaternion.copy(parent.invert().multiply(q.multiply(world)))
  b.updateMatrixWorld(true)
}

/** Brat din doua oase intins spre o tinta: cotul iese spre `pole`. */
function reach(upper, lower, hand, target, pole) {
  const s = worldPos(upper)
  const a = s.distanceTo(worldPos(lower))
  const b = worldPos(lower).distanceTo(worldPos(hand))
  const dir = target.clone().sub(s)
  const d = Math.min(Math.max(dir.length(), 0.05), (a + b) * 0.995)
  dir.normalize()
  const cos = (a * a + d * d - b * b) / (2 * a * d)
  const side = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize()
  const elbow = s.clone().addScaledVector(dir, a * cos).addScaledVector(side, a * Math.sqrt(Math.max(0, 1 - cos * cos)))
  turn(upper, worldPos(lower).sub(s), elbow.clone().sub(s))
  const e = worldPos(lower)
  turn(lower, worldPos(hand).sub(e), s.clone().addScaledVector(dir, d).sub(e))
}

function rigOf(root) {
  const turnRoot = root.quaternion.clone()
  const bones = new Map()
  root.traverse((o) => { if (o.isBone) bones.set(o.name, o) })
  const get = (name) => {
    const b = bones.get(name)
    if (!b) throw new Error(`os lipsa: ${name}`)
    return b
  }
  return {
    root,
    turnRoot,
    rest: [...bones.values()].map((b) => [b, { position: b.position.clone(), quaternion: b.quaternion.clone(), scale: b.scale.clone() }]),
    head: get('Bip01_Head'),
    nose: get('Bip01_MNose'),
    rUpper: get('Bip01_R_UpperArm'),
    rLower: get('Bip01_R_Forearm'),
    rHand: get('Bip01_R_Hand'),
    lUpper: get('Bip01_L_UpperArm'),
    lLower: get('Bip01_L_Forearm'),
    lHand: get('Bip01_L_Hand'),
  }
}

/**
 * Pozele din multime, ca puncte fata de ochi, in metri pentru un om de 1,8 m: `high` cu telefonul peste
 * capete, ca la filmat, `eye` cu telefonul in fata ochilor. `cheer` mai ridica si cealalta mana.
 */
const POSES = {
  high: { right: [0.08, 0.3, 0.16] },
  eye: { right: [0.1, -0.06, 0.22] },
  cheer: { right: [0.08, 0.3, 0.16], left: [-0.2, 0.62, 0.1] },
  // acelasi brat ridicat, indoit: pumnul langa cap; scena trece intre cele doua pe ritm
  pump: { right: [0.08, 0.3, 0.16], left: [-0.22, -0.02, 0.18] },
  walk: { right: [0.08, -0.26, 0.28] },
}

/** Doar rotatiile oaselor: lungimea lor ramane a personajului, nu a celui pe care s-a filmat miscarea. */
function rotationsOnly(clip) {
  return new THREE.AnimationClip(clip.name, clip.duration, clip.tracks.filter((t) => t.name.startsWith('Bip01') && t.name.endsWith('.quaternion')))
}

/** Pune personajul intr-o poza; intoarce punctele de care e nevoie pentru telefon. */
function pose(root, rig, name, clips, refs) {
  const p = POSES[name]
  root.quaternion.copy(rig.turnRoot)
  for (const [b, t] of rig.rest) {
    b.position.copy(t.position)
    b.quaternion.copy(t.quaternion)
    b.scale.copy(t.scale)
  }
  const mixer = new THREE.AnimationMixer(root)
  const clip = name === 'walk' ? clips.walk : clips.idle
  mixer.clipAction(clip).play()
  mixer.setTime(name === 'walk' ? clip.duration * 0.27 : Math.min(0.6, clip.duration * 0.2))
  root.updateMatrixWorld(true)
  // miscarea il poate intoarce: il rotim pe loc, cu fata (nasul) spre +z, inainte de brate
  const look = worldPos(rig.nose).sub(worldPos(rig.head))
  const yaw = Math.atan2(look.x, look.z)
  root.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(v3(0, 1, 0), -yaw))
  root.updateMatrixWorld(true)

  // inaltimea din varfurile pozate: cutia obiectelor nu vede scara scheletului
  const P = posed(refs)
  let y0 = Infinity
  let y1 = -Infinity
  for (let i = 1; i < P.length; i += 3) {
    y0 = Math.min(y0, P[i])
    y1 = Math.max(y1, P[i])
  }
  const hs = (y1 - y0) / 1.8
  // dreapta: de partea umarului drept
  const head = worldPos(rig.head)
  const rightSign = Math.sign(worldPos(rig.rUpper).x - worldPos(rig.lUpper).x) || -1
  const eye = head.clone().add(v3(0, 0.07 * hs, 0.09 * hs))
  const at = ([x, y, z]) => eye.clone().add(v3(x * rightSign * hs, y * hs, z * hs))
  const down = v3(0, -1, 0)
  reach(rig.rUpper, rig.rLower, rig.rHand, at(p.right), v3(rightSign * 0.9, 0, -0.25).add(down))
  if (p.left) reach(rig.lUpper, rig.lLower, rig.lHand, at(p.left), v3(-rightSign * 0.9, 0, -0.25).add(down))
  root.updateMatrixWorld(true)
  return { hs, eye, rightSign }
}

// ---------------------------------------------------------------- geometria

// pielea: rosul trece clar de verde, verdele de albastru
const skinLike = (r, g, b) => r > 0.35 && r > g + 0.06 && g > b + 0.03 && r - b < 0.55

function roleOf(mat, color, joint) {
  const [r, g, b] = color
  if (mat === MAT.hair) return ROLE.hair
  if (mat === MAT.head) return skinLike(r, g, b) ? ROLE.skin : ROLE.hair
  if (/Hand|Finger/.test(joint)) return ROLE.skin
  if (/Foot|Toe/.test(joint)) return skinLike(r, g, b) ? ROLE.skin : ROLE.shoes
  if (/Thigh|Calf|Pelvis/.test(joint)) return skinLike(r, g, b) ? ROLE.skin : ROLE.bottom
  return skinLike(r, g, b) ? ROLE.skin : ROLE.top
}

/** Culoarea texturii la un UV, ca sa stim rolul varfului (piele sau haine). */
function sample(img, u, v) {
  const x = Math.min(img.width - 1, Math.max(0, Math.floor(u * img.width)))
  const y = Math.min(img.height - 1, Math.max(0, Math.floor((1 - v) * img.height)))
  const o = (y * img.width + x) * 4
  return [img.data[o] / 255, img.data[o + 1] / 255, img.data[o + 2] / 255]
}

/**
 * Varfurile unite (aceeasi pozitie, acelasi UV, acelasi material): plasa din FBX vine cu fiecare triunghi separat.
 * Fiecare varf tine minte varful lui din FBX, pentru oase.
 */
function collect(mesh, images) {
  const g = mesh.geometry
  const P = g.attributes.position
  const UV = g.attributes.uv
  const matOf = new Int8Array(P.count)
  for (const gr of g.groups) matOf.fill(gr.materialIndex, gr.start, gr.start + gr.count)
  const skinIndex = g.attributes.skinIndex
  const skinWeight = g.attributes.skinWeight
  const map = new Map()
  const refs = []
  const tris = [[], [], []]
  for (let t = 0; t < P.count; t += 3) {
    const ids = []
    for (let k = 0; k < 3; k++) {
      const i = t + k
      const mat = matOf[i]
      const u = UV.getX(i)
      const v = UV.getY(i)
      const key = `${Math.round(P.getX(i) * 100)},${Math.round(P.getY(i) * 100)},${Math.round(P.getZ(i) * 100)}|${Math.round(u * 1e4)},${Math.round(v * 1e4)}|${mat}`
      let j = map.get(key)
      if (j === undefined) {
        j = refs.length
        map.set(key, j)
        let joint = ''
        let best = 0
        for (let c = 0; c < 4; c++) {
          const w = skinWeight.getComponent(i, c)
          if (w > best) {
            best = w
            joint = mesh.skeleton.bones[skinIndex.getComponent(i, c)]?.name ?? ''
          }
        }
        const color = sample(images[mat], u, v)
        refs.push({ mesh, i, mat, u: Math.min(1, Math.max(0, u)), v: Math.min(1, Math.max(0, v)), color, role: roleOf(mat, color, joint) })
      }
      ids.push(j)
    }
    if (ids[0] !== ids[1] && ids[1] !== ids[2] && ids[0] !== ids[2]) tris[refs[ids[0]].mat].push(...ids)
  }
  return { refs, tris }
}

/** Pozitiile varfurilor in poza curenta a scheletului. */
function posed(refs) {
  const out = new Float32Array(refs.length * 3)
  const v = v3()
  refs.forEach(({ mesh, i }, k) => {
    v.fromBufferAttribute(mesh.geometry.attributes.position, i)
    mesh.applyBoneTransform(i, v)
    v.applyMatrix4(mesh.matrixWorld)
    out.set([v.x, v.y, v.z], k * 3)
  })
  return out
}

/** O treapta de detaliu pentru o parte (corp si cap, sau par): triunghiurile ramase, cu varfurile din `refs`. */
function simplify(refs, pos, tris, target) {
  let index = Uint32Array.from(tris)
  if (index.length / 3 > target) {
    const attrs = new Float32Array(refs.length * 3)
    refs.forEach((r, i) => attrs.set([r.u, r.v, r.role * 0.25], i * 3))
    ;[index] = MeshoptSimplifier.simplifyWithAttributes(index, pos, 3, attrs, 3, [1, 1, 1.5], null, target * 3, 0.25, [])
    if (index.length / 3 > target * 1.4) [index] = MeshoptSimplifier.simplifySloppy(index, pos, 3, null, target * 3, 0.1)
  }
  return Array.from(index)
}

const keyOf = (pos, i) => `${Math.round(pos[i * 3] * 1e4)},${Math.round(pos[i * 3 + 1] * 1e4)},${Math.round(pos[i * 3 + 2] * 1e4)}`

/** Normale netede, aceleasi de o parte si de alta a unei cusaturi: de aproape omul nu mai arata facut din fete. */
function smoothNormals(pos, index) {
  const sum = new Map()
  const a = v3()
  const b = v3()
  const c = v3()
  for (let t = 0; t < index.length; t += 3) {
    const [i, j, k] = [index[t], index[t + 1], index[t + 2]]
    a.fromArray(pos, i * 3)
    b.fromArray(pos, j * 3)
    c.fromArray(pos, k * 3)
    const n = b.clone().sub(a).cross(c.clone().sub(a))
    for (const q of [i, j, k]) {
      const id = keyOf(pos, q)
      sum.set(id, (sum.get(id) ?? v3()).add(n))
    }
  }
  const out = new Float32Array(pos.length)
  for (let i = 0; i < pos.length / 3; i++) {
    const n = (sum.get(keyOf(pos, i)) ?? v3(0, 1, 0)).normalize()
    out.set([n.x, n.y, n.z], i * 3)
  }
  return out
}

/** Telefonul din mana dreapta: ecranul spre ochi, cu coordonatele lui (-1..1) pentru imaginea din scena. */
function phone(rig, frame, level) {
  const hand = worldPos(rig.rHand)
  const kids = rig.rHand.children.filter((k) => k.isBone)
  const tip = kids.length ? kids.reduce((s, k) => s.add(worldPos(k)), v3()).divideScalar(kids.length) : hand.clone().multiplyScalar(2).sub(worldPos(rig.rLower))
  const along = tip.clone().sub(hand).normalize()
  const center = hand.clone().addScaledVector(along, 0.07 * frame.hs)
  const normal = frame.eye.clone().sub(center).normalize()
  const up = v3(0, 1, 0).sub(normal.clone().multiplyScalar(normal.y)).normalize()
  const right = up.clone().cross(normal).normalize()
  const w = 0.09 * frame.hs
  const h = 0.184 * frame.hs
  const d = 0.011 * frame.hs
  // aproape rotunjit, in multime o cutie, de departe doar ecranul
  const g = level === 0 ? new RoundedBoxGeometry(w, h, d, 1, w * 0.16) : level === 1 ? new THREE.BoxGeometry(w, h, d) : new THREE.PlaneGeometry(w, h).translate(0, 0, d / 2)
  const basis = new THREE.Matrix4().makeBasis(right, up, normal).setPosition(center)
  const P = g.attributes.position
  const N = g.attributes.normal
  const pos = []
  const nrm = []
  const role = []
  const screen = []
  const p = v3()
  const n = v3()
  for (let i = 0; i < P.count; i++) {
    const front = N.getZ(i) > 0.9 && P.getZ(i) > 0
    p.fromBufferAttribute(P, i).applyMatrix4(basis)
    n.fromBufferAttribute(N, i).transformDirection(basis)
    pos.push(p.x, p.y, p.z)
    nrm.push(n.x, n.y, n.z)
    role.push(front ? ROLE.screen : ROLE.dark)
    screen.push(front ? P.getX(i) / (w / 2) : 0, front ? P.getY(i) / (h / 2) : 0)
  }
  const index = g.index ? Array.from(g.index.array) : [...Array(P.count).keys()]
  return { pos, nrm, role, screen, index, center }
}

/** Normala in doi octeti (octaedru). */
function oct(x, y, z) {
  const s = Math.abs(x) + Math.abs(y) + Math.abs(z) || 1
  let u = x / s
  let v = y / s
  if (z < 0) {
    const pu = (1 - Math.abs(v)) * (u >= 0 ? 1 : -1)
    v = (1 - Math.abs(u)) * (v >= 0 ? 1 : -1)
    u = pu
  }
  return [Math.round(u * 127), Math.round(v * 127)]
}

// ---------------------------------------------------------------- atlasul

const rows = Math.ceil(CHARACTERS.length / COLS)
const atlas = { width: COLS * SLOT.w, height: rows * SLOT.h }
const atlasData = new Uint8Array(atlas.width * atlas.height * 4)

/** Unde sta in atlas fiecare textura a omului `n`: x, y (de sus), marime. */
function rectOf(n, mat) {
  const x = (n % COLS) * SLOT.w
  const y = Math.floor(n / COLS) * SLOT.h
  if (mat === MAT.body) return { x, y, size: 256 }
  if (mat === MAT.head) return { x, y: y + 256, size: 128 }
  return { x: x + 128, y: y + 256, size: 128 }
}

function paste(img, rect) {
  for (let y = 0; y < img.height; y++) {
    atlasData.set(img.data.subarray(y * img.width * 4, (y + 1) * img.width * 4), ((rect.y + y) * atlas.width + rect.x) * 4)
  }
}

/** UV-ul din textura materialului, mutat in atlas (atlasul se incarca intors, ca orice textura three.js). */
function atlasUv(n, mat, u, v) {
  const r = rectOf(n, mat)
  return [(r.x + u * r.size) / atlas.width, 1 - (r.y + (1 - v) * r.size) / atlas.height]
}

// ---------------------------------------------------------------- personajele

await MeshoptSimplifier.ready

const clipCache = new Map()
async function clipOf(path) {
  if (!clipCache.has(path)) {
    const [folder, name] = path.split('/')
    const buf = await cached(`${REPO}/Animations/all_animations_max_motextr_${folder}/${name}.max.fbx`, `${name}.fbx`)
    const root = parseFbx(buf)
    clipCache.set(path, rotationsOnly(root.animations[0]))
  }
  return clipCache.get(path)
}

// pozele fiecaruia; unii mai ridica si cealalta mana, unul merge prin multime
const EXTRA = { party: ['cheer', 'pump'], party2: ['cheer', 'pump'], polo: ['cheer', 'pump'], track: ['cheer', 'pump'], greentee: ['cheer', 'pump'], navy: ['walk', 'cheer', 'pump'] }

const chars = []
for (const [n, c] of CHARACTERS.entries()) {
  const base = `${REPO}/Avatars/Adults/${c.dir}`
  const root = parseFbx(await cached(`${base}/Export/${c.dir}.fbx`, `${c.dir}.fbx`))
  const tga = async (part, optional) => {
    const buf = await cached(`${base}/Textures/${c.tex}_${part}_color.tga`, `${c.tex}_${part}_color.tga`, optional)
    return buf ? decodeTga(buf) : null
  }
  // cei tunsi scurt nu au suvite: parul lor e doar pictat pe cap
  const full = [await tga('body'), await tga('head'), (await tga('opacity', true)) ?? { width: 128, height: 128, data: new Uint8Array(128 * 128 * 4) }]
  let mesh = null
  root.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o })
  root.updateMatrixWorld(true)

  const rig = rigOf(root)
  const clips = { idle: await clipOf(CLIPS[c.sex].idle), walk: await clipOf(CLIPS[c.sex].walk) }
  const poses = ['high', 'eye', ...(EXTRA[c.id] ?? [])]

  // topologia vine din poza de repaus; pozele doar muta aceleasi varfuri
  const { refs, tris } = collect(mesh, full)
  pose(root, rig, 'eye', clips, refs)
  const rest = posed(refs)

  // texturile, micsorate si cu marginile prelungite, in locul lor din atlas
  const sizes = [256, 128, 128]
  sizes.forEach((size, mat) => {
    const img = shrink(full[mat], size)
    const used = mat === MAT.hair
      ? Uint8Array.from({ length: size * size }, (_, i) => (img.data[i * 4 + 3] > 127 ? 1 : 0))
      : coverage(size, Array.from({ length: tris[mat].length / 3 }, (_, t) => [0, 1, 2].map((k) => [refs[tris[mat][t * 3 + k]].u, refs[tris[mat][t * 3 + k]].v])))
    bleed(img, used)
    if (mat !== MAT.hair) for (let i = 0; i < size * size; i++) img.data[i * 4 + 3] = 255
    paste(img, rectOf(n, mat))
  })

  const roleColor = new Map()
  for (const r of refs) {
    const s = roleColor.get(r.role) ?? [0, 0, 0, 0]
    s[0] += r.color[0]
    s[1] += r.color[1]
    s[2] += r.color[2]
    s[3]++
    roleColor.set(r.role, s)
  }
  const roles = [...roleColor.keys()]
  const palette = roles.map((role) => {
    const s = roleColor.get(role)
    return [...s.slice(0, 3).map((v) => Math.round((v / s[3]) * 255)), role]
  })

  const body = [...tris[MAT.body], ...tris[MAT.head]]
  const lods = LODS.map((target, level) => {
    const index = simplify(refs, rest, body, target)
    const hair = level === 0 ? simplify(refs, rest, tris[MAT.hair], HAIR) : []
    // varfurile renumerotate in ordinea primei folosiri: corpul, parul, apoi parul vazut din spate
    const keep = []
    const local = new Map()
    const idOf = (i) => {
      let j = local.get(i)
      if (j === undefined) {
        j = keep.length
        local.set(i, j)
        keep.push(i)
      }
      return j
    }
    // suvitele sunt foi subtiri: scena le deseneaza pe amandoua fetele
    const bodyIdx = index.map(idOf)
    const hairIdx = hair.map(idOf)
    return {
      keep,
      bodyIdx,
      hairIdx,
      colors: keep.map((i) => roles.indexOf(refs[i].role)),
      uv: keep.map((i) => atlasUv(n, refs[i].mat, refs[i].u, refs[i].v)),
      poses: [],
    }
  })

  for (const name of poses) {
    const frame = pose(root, rig, name, clips, refs)
    const P = posed(refs)
    lods.forEach((lod, level) => {
      const nv = lod.keep.length
      const pos = new Float32Array(nv * 3)
      lod.keep.forEach((i, k) => pos.set([P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], k * 3))
      // corpul si parul au fiecare normalele lor: varfurile lor nu se ating
      const nrm = smoothNormals(pos, [...lod.bodyIdx, ...lod.hairIdx])
      const ph = phone(rig, frame, level)
      // talpile la y = 0, telefonul la (0, 1, 0)
      let minY = Infinity
      let top = -Infinity
      for (let i = 1; i < pos.length; i += 3) {
        minY = Math.min(minY, pos[i])
        top = Math.max(top, pos[i])
      }
      const k = 1 / (ph.center.y - minY)
      const norm = (arr) => {
        const out = new Float32Array(arr.length)
        for (let i = 0; i < arr.length; i += 3) {
          out[i] = (arr[i] - ph.center.x) * k
          out[i + 1] = (arr[i + 1] - minY) * k
          out[i + 2] = (arr[i + 2] - ph.center.z) * k
        }
        return out
      }
      lod.poses.push({ name, pos: norm([...pos, ...ph.pos]), nrm: Float32Array.from([...nrm, ...ph.nrm]), height: (top - minY) * k })
      if (!lod.phone) lod.phone = { start: nv, role: ph.role, screen: ph.screen, index: ph.index.map((i) => i + nv) }
    })
  }
  chars.push({ id: c.id, title: c.dir.replaceAll('_', ' '), palette, poses, lods })
  console.log(`${c.id}: ${poses.join(', ')} · ${lods.map((l) => `${l.bodyIdx.length / 3}+${l.hairIdx.length / 3}+${l.phone.index.length / 3} tri / ${l.keep.length} v`).join(', ')}`)
}

// ---------------------------------------------------------------- fisierele

// pozitii pe 16 biti in cutia comuna; diferentele dintre varfuri vecine si dintre indici se comprima bine
const lo = [Infinity, Infinity, Infinity]
const hi = [-Infinity, -Infinity, -Infinity]
for (const c of chars) for (const l of c.lods) for (const p of l.poses) for (let i = 0; i < p.pos.length; i++) {
  lo[i % 3] = Math.min(lo[i % 3], p.pos[i])
  hi[i % 3] = Math.max(hi[i % 3], p.pos[i])
}
const parts = []
let size = 0
const push = (typed) => {
  const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength)
  const at = size
  parts.push(bytes)
  size += bytes.length
  const pad = (4 - (size % 4)) % 4
  if (pad) {
    parts.push(new Uint8Array(pad))
    size += pad
  }
  return at
}
const delta16 = (values) => {
  const out = new Uint16Array(values.length)
  let prev = 0
  values.forEach((v, i) => {
    out[i] = (v - prev) & 0xffff
    prev = v
  })
  return out
}
const header = { box: [lo, hi], roles: ROLE, atlas: { width: atlas.width, height: atlas.height }, chars: [] }
for (const c of chars) {
  header.chars.push({
    id: c.id,
    palette: c.palette,
    poses: c.poses,
    lods: c.lods.map((l) => {
      const n = l.keep.length
      const total = n + l.phone.role.length
      // triunghiurile: corpul si capul, telefonul, apoi parul (desenat separat, cu transparenta)
      const idx = [...l.bodyIdx, ...l.phone.index, ...l.hairIdx]
      const col = Uint8Array.from([...l.colors, ...l.phone.role.map((r) => 255 - r)])
      const scr = Int8Array.from(l.phone.screen.map((v) => Math.round(Math.max(-1, Math.min(1, v)) * 127)))
      const uv = new Uint16Array(total * 2)
      l.uv.forEach(([u, v], i) => uv.set([Math.round(u * 65535), Math.round(v * 65535)], i * 2))
      return {
        count: total,
        body: l.bodyIdx.length,
        phoneTris: l.phone.index.length,
        hair: l.hairIdx.length,
        tris: idx.length / 3,
        phone: n,
        idx: push(delta16(idx)),
        col: push(col),
        scr: push(scr),
        uv: push(uv),
        poses: l.poses.map((p) => {
          const q = []
          for (let i = 0; i < total; i++) for (let k = 0; k < 3; k++) q.push(Math.round(((p.pos[i * 3 + k] - lo[k]) / (hi[k] - lo[k])) * 65535))
          // diferentele pe fiecare axa, separat
          const axes = [0, 1, 2].flatMap((k) => Array.from(delta16(q.filter((_, i) => i % 3 === k))))
          const nrm = new Int8Array(total * 2)
          for (let i = 0; i < total; i++) nrm.set(oct(p.nrm[i * 3], p.nrm[i * 3 + 1], p.nrm[i * 3 + 2]), i * 2)
          return { name: p.name, height: +p.height.toFixed(3), pos: push(Uint16Array.from(axes)), nrm: push(nrm) }
        }),
      }
    }),
  })
}
header.credits = CHARACTERS.map((c) => `${c.dir} · Microsoft Rocketbox · MIT · https://github.com/microsoft/Microsoft-Rocketbox`)
const text = new TextEncoder().encode(JSON.stringify(header))
const headLen = text.length + ((4 - (text.length % 4)) % 4)
const file = new Uint8Array(8 + headLen + size)
file.set(new TextEncoder().encode('PPL3'), 0)
new DataView(file.buffer).setUint32(4, headLen, true)
file.set(text, 8)
file.fill(0x20, 8 + text.length, 8 + headLen)
let at = 8 + headLen
for (const p of parts) {
  file.set(p, at)
  at += p.length
}
const packed = gzipSync(file, { level: 9 })
writeFileSync(OUT, packed)
console.log(`\n${OUT.replace(site, '')}: ${(file.length / 1024).toFixed(0)} KB, comprimat ${(packed.length / 1024).toFixed(0)} KB`)

// atlasul: pixelii bruti, apoi WebP prin ImageMagick
const raw = resolve(CACHE, 'atlas.rgba')
writeFileSync(raw, atlasData)
execFileSync('magick', ['-size', `${atlas.width}x${atlas.height}`, '-depth', '8', `rgba:${raw}`, '-quality', '84', '-define', 'webp:method=6', '-define', 'webp:alpha-quality=90', ATLAS])
console.log(`${ATLAS.replace(site, '')}: ${atlas.width} x ${atlas.height}, ${(readFileSync(ATLAS).length / 1024).toFixed(0)} KB`)
