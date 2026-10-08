// Oamenii din multime: personaje CC0 de la Quaternius (prin Poly Pizza), puse in pozele de la concert, cu telefonul
// ridicat, simplificate pe trepte de detaliu si scrise intr-un singur fisier mic: src/scene/people.dat (gzip).
// Folosire: npm run people   (modelele se descarca o singura data, in node_modules/.cache/people)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync, inflateSync } from 'node:zlib'
import { MeshoptSimplifier } from 'meshoptimizer'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

const site = fileURLToPath(new URL('..', import.meta.url))
const CACHE = resolve(site, 'node_modules/.cache/people')
const OUT = resolve(site, 'src/scene/people.dat')

// Toate sunt CC0 (domeniu public), de la Quaternius: https://poly.pizza/u/Quaternius
const CHARACTERS = [
  { id: 'hoodie', file: 'bcd66ec5-5e81-4901-a222-47abc875fe2a', title: 'Hoodie Character' },
  { id: 'casual', file: '90a9e2d4-053f-42f1-99a2-8f5e1180ea7f', title: 'Casual Character' },
  { id: 'beach', file: 'f771a536-1c18-4a47-bb56-ceea4b603455', title: 'Beach Character' },
  { id: 'punk', file: 'e56f23b5-3270-406f-8924-f77cad980c43', title: 'Punk' },
  { id: 'woman', file: 'cf08b740-dd48-443e-9fde-6d3d54abf119', title: 'Animated Woman' },
  { id: 'tank', file: '9a6a3e55-23ce-4d5c-89bc-7d3f30307ed0', title: 'Woman in Tank Top' },
  { id: 'wcasual', file: '51d5abdd-bb87-4b8d-9967-21738ffb8437', title: 'Woman Casual' },
]

// Rolurile varfurilor: dupa ele, scena da fiecarui om alte haine si alt ton al pielii.
const ROLE = { top: 0, skin: 1, hair: 2, screen: 3, bottom: 4, shoes: 5, dark: 6 }

// Trepte de detaliu, in triunghiuri: de aproape, din multime si de departe (pe telefoane).
const LODS = [1100, 220, 80]

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)

// ---------------------------------------------------------------- fisierele

async function source(c) {
  mkdirSync(CACHE, { recursive: true })
  const path = resolve(CACHE, `${c.id}.glb`)
  if (!existsSync(path)) {
    const res = await fetch(`https://static.poly.pizza/${c.file}.glb`)
    if (!res.ok) throw new Error(`${c.title}: ${res.status}`)
    writeFileSync(path, Buffer.from(await res.arrayBuffer()))
  }
  return readFileSync(path)
}

/** GLB-ul desfacut in JSON si bucata binara. */
function readGlb(buf) {
  const json = JSON.parse(buf.toString('utf8', 20, 20 + buf.readUInt32LE(12)))
  const at = 20 + buf.readUInt32LE(12)
  const bin = buf.subarray(at + 8, at + 8 + buf.readUInt32LE(at))
  return { json, bin }
}

function writeGlb(json, bin) {
  const text = Buffer.from(JSON.stringify(json))
  const jsonChunk = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 0x20)])
  const binChunk = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)])
  const head = Buffer.alloc(12)
  head.write('glTF', 0)
  head.writeUInt32LE(2, 4)
  head.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8)
  const chunk = (data, type) => {
    const h = Buffer.alloc(8)
    h.writeUInt32LE(data.length, 0)
    h.write(type, 4)
    return Buffer.concat([h, data])
  }
  return Buffer.concat([head, chunk(jsonChunk, 'JSON'), chunk(binChunk, 'BIN\0')])
}

/** PNG necomprimat in RGBA, destul pentru paletele de 32 x 32 ale personajelor. */
function decodePng(buf) {
  let at = 8
  let width = 0
  let height = 0
  let type = 0
  const data = []
  while (at < buf.length) {
    const len = buf.readUInt32BE(at)
    const kind = buf.toString('ascii', at + 4, at + 8)
    const body = buf.subarray(at + 8, at + 8 + len)
    if (kind === 'IHDR') {
      width = body.readUInt32BE(0)
      height = body.readUInt32BE(4)
      if (body[8] !== 8 || body[12] !== 0) throw new Error('PNG: doar 8 biti, fara intretesere')
      type = body[9]
    } else if (kind === 'IDAT') data.push(body)
    at += 12 + len
  }
  const bpp = { 2: 3, 6: 4, 0: 1, 4: 2 }[type]
  const raw = inflateSync(Buffer.concat(data))
  const stride = width * bpp
  const out = new Uint8Array(width * height * 4)
  const prev = new Uint8Array(stride)
  const row = new Uint8Array(stride)
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)]
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x]
      const a = x >= bpp ? row[x - bpp] : 0
      const b = prev[x]
      const c = x >= bpp ? prev[x - bpp] : 0
      let p = v
      if (f === 1) p = v + a
      else if (f === 2) p = v + b
      else if (f === 3) p = v + ((a + b) >> 1)
      else if (f === 4) {
        const pa = Math.abs(b - c)
        const pb = Math.abs(a - c)
        const pc = Math.abs(a + b - 2 * c)
        p = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)
      }
      row[x] = p & 255
    }
    for (let x = 0; x < width; x++) {
      const s = x * bpp
      const o = (y * width + x) * 4
      if (bpp >= 3) out.set([row[s], row[s + 1], row[s + 2], bpp === 4 ? row[s + 3] : 255], o)
      else out.set([row[s], row[s], row[s], 255], o)
    }
    prev.set(row)
  }
  return { width, height, data: out }
}

/** Personajul incarcat in three.js, fara texturi (paleta, daca are, ramane deoparte, pentru culori). */
async function load(c) {
  const { json, bin } = readGlb(await source(c))
  let palette = null
  if (json.images?.length) {
    const view = json.bufferViews[json.images[0].bufferView]
    palette = decodePng(Buffer.from(bin.buffer, bin.byteOffset + (view.byteOffset ?? 0), view.byteLength))
    for (const m of json.materials ?? []) if (m.pbrMetallicRoughness) delete m.pbrMetallicRoughness.baseColorTexture
    delete json.images
    delete json.textures
    delete json.samplers
  }
  const glb = writeGlb(json, Buffer.from(bin))
  const gltf = await new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), '')
  return { gltf, palette }
}

// ---------------------------------------------------------------- poza

const bone = (bones, re) => bones.find((b) => re.test(b.name))
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

function rigOf(gltf) {
  const bones = []
  gltf.scene.traverse((o) => { if (o.isBone) bones.push(o) })
  const find = (...res) => {
    for (const re of res) {
      const b = bone(bones, re)
      if (b) return b
    }
    throw new Error(`os lipsa: ${res.join(' / ')}`)
  }
  return {
    rest: bones.map((b) => [b, { position: b.position.clone(), quaternion: b.quaternion.clone(), scale: b.scale.clone() }]),
    head: find(/^Head$/),
    rUpper: find(/^UpperArmR$/, /^RightArm$/),
    rLower: find(/^LowerArmR$/, /^RightForeArm$/),
    rHand: find(/^WristR$/, /^PalmR$/, /^RightHand$/),
    lUpper: find(/^UpperArmL$/, /^LeftArm$/),
    lLower: find(/^LowerArmL$/, /^LeftForeArm$/),
    lHand: find(/^WristL$/, /^PalmL$/, /^LeftHand$/),
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
  walk: { right: [0.1, -0.12, 0.24] },
}

function clipFor(gltf, re) {
  return gltf.animations.find((a) => re.test(a.name)) ?? gltf.animations[0]
}

/** Pune personajul intr-o poza; intoarce punctele de care e nevoie pentru telefon. */
function pose(gltf, rig, name, mixer, refs) {
  const p = POSES[name]
  // oasele pe care animatia nu le misca ar pastra altfel poza de dinainte
  for (const [b, t] of rig.rest) {
    b.position.copy(t.position)
    b.quaternion.copy(t.quaternion)
    b.scale.copy(t.scale)
  }
  mixer.stopAllAction()
  const clip = name === 'walk' ? clipFor(gltf, /(^|\|)(Female_)?Walk(ing)?$/) : clipFor(gltf, /(^|\|)(Female_)?Idle$/)
  mixer.clipAction(clip).reset().play()
  mixer.setTime(name === 'walk' ? clip.duration * 0.25 : 0.4)
  gltf.scene.updateMatrixWorld(true)

  // inaltimea din varfurile pozate: cutia obiectelor nu vede scara scheletului
  const P = posed(refs)
  let y0 = Infinity
  let y1 = -Infinity
  for (let i = 1; i < P.length; i += 3) {
    y0 = Math.min(y0, P[i])
    y1 = Math.max(y1, P[i])
  }
  const hs = (y1 - y0) / 1.8
  // dreapta personajului: de partea umarului drept
  const rightSign = Math.sign(worldPos(rig.rUpper).x - worldPos(rig.lUpper).x) || -1
  const head = worldPos(rig.head)
  const eye = head.clone().add(v3(0, 0.07 * hs, 0.09 * hs))
  const at = ([x, y, z]) => eye.clone().add(v3(x * rightSign * hs, y * hs, z * hs))
  const down = v3(0, -1, 0)

  reach(rig.rUpper, rig.rLower, rig.rHand, at(p.right), v3(rightSign * 0.9, 0, -0.25).add(down))
  if (p.left) reach(rig.lUpper, rig.lLower, rig.lHand, at(p.left), v3(-rightSign * 0.9, 0, -0.25).add(down))
  gltf.scene.updateMatrixWorld(true)
  return { hs, eye, rightSign }
}

// ---------------------------------------------------------------- geometria

// pielea: rosul trece clar de verde, verdele de albastru (parul blond are rosul aproape cat verdele)
const skinLike = (r, g, b) => r > 0.35 && r > g + 0.08 && g > b + 0.05 && r - b < 0.55

function roleOf(mesh, color, joint) {
  const m = mesh.material.name
  const n = mesh.name
  if (/skin/i.test(m)) return ROLE.skin
  if (/hair|eyebrow/i.test(m)) return ROLE.hair
  if (/eye/i.test(m)) return ROLE.dark
  if (/shoe/i.test(m) || /feet/i.test(n)) return ROLE.shoes
  if (/pants|sock|short/i.test(m) || /legs/i.test(n)) return ROLE.bottom
  if (m !== 'Material') return ROLE.top
  // personaj pictat dintr-o paleta: rolul vine din os si din culoare
  const [r, g, b] = color
  if (/Head|Neck/.test(joint)) return skinLike(r, g, b) ? ROLE.skin : ROLE.hair
  if (/Hand/.test(joint)) return ROLE.skin
  if (/Foot|Toe/.test(joint)) return ROLE.shoes
  if (/UpLeg|Leg$|Hips/.test(joint)) return ROLE.bottom
  return skinLike(r, g, b) ? ROLE.skin : ROLE.top
}

const srgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)
const linear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))

/** Varfurile originale (plasa, indice), cu culoarea sRGB pe 8 biti si rolul lor, plus triunghiurile. */
function collect(gltf, palette) {
  const refs = []
  const index = []
  gltf.scene.traverse((mesh) => {
    if (!mesh.isMesh) return
    const g = mesh.geometry
    const P = g.attributes.position
    const uv = g.attributes.uv
    const skinIndex = g.attributes.skinIndex
    const skinWeight = g.attributes.skinWeight
    const base = mesh.material.color
    const offset = refs.length
    for (let i = 0; i < P.count; i++) {
      let r = base.r
      let gg = base.g
      let b = base.b
      if (palette && uv) {
        const px = Math.min(palette.width - 1, Math.max(0, Math.floor(uv.getX(i) * palette.width)))
        const py = Math.min(palette.height - 1, Math.max(0, Math.floor(uv.getY(i) * palette.height)))
        const o = (py * palette.width + px) * 4
        r *= linear(palette.data[o] / 255)
        gg *= linear(palette.data[o + 1] / 255)
        b *= linear(palette.data[o + 2] / 255)
      }
      const color = [srgb(r), srgb(gg), srgb(b)].map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255))
      let joint = ''
      if (mesh.isSkinnedMesh) {
        let best = 0
        for (let k = 0; k < 4; k++) {
          const w = skinWeight.getComponent(i, k)
          if (w > best) {
            best = w
            joint = mesh.skeleton.bones[skinIndex.getComponent(i, k)]?.name ?? ''
          }
        }
      }
      refs.push({ mesh, i, color, role: roleOf(mesh, color.map((c) => c / 255), joint) })
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) index.push(offset + g.index.getX(i))
    else for (let i = 0; i < P.count; i++) index.push(offset + i)
  })
  return { refs, index }
}

/** Pozitiile varfurilor in poza curenta a scheletului. */
function posed(refs) {
  const out = new Float32Array(refs.length * 3)
  const v = v3()
  refs.forEach(({ mesh, i }, k) => {
    v.fromBufferAttribute(mesh.geometry.attributes.position, i)
    if (mesh.isSkinnedMesh) mesh.applyBoneTransform(i, v)
    v.applyMatrix4(mesh.matrixWorld)
    out.set([v.x, v.y, v.z], k * 3)
  })
  return out
}

const keyOf = (pos, i) => `${Math.round(pos[i * 3] * 1e4)},${Math.round(pos[i * 3 + 1] * 1e4)},${Math.round(pos[i * 3 + 2] * 1e4)}`

/** Varfurile identice (pozitie, culoare, rol) se unesc; restul raman cusaturi pe care simplificarea le respecta. */
function weld(refs, pos, index) {
  const map = new Map()
  const keep = []
  const remap = []
  refs.forEach((r, i) => {
    const key = `${keyOf(pos, i)}|${r.role}|${r.color.join(',')}`
    let j = map.get(key)
    if (j === undefined) {
      j = keep.length
      map.set(key, j)
      keep.push(i)
    }
    remap.push(j)
  })
  const tris = []
  for (let t = 0; t < index.length; t += 3) {
    const a = remap[index[t]]
    const b = remap[index[t + 1]]
    const c = remap[index[t + 2]]
    if (a !== b && b !== c && a !== c) tris.push(a, b, c)
  }
  return { refs: keep.map((i) => refs[i]), pos: Float32Array.from(keep.flatMap((i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]])), index: tris }
}

/** O treapta de detaliu, simplificata in poza de repaus: ce varfuri raman si triunghiurile lor, renumerotate. */
function simplify(body, target) {
  let index = Uint32Array.from(body.index)
  if (index.length / 3 > target) {
    const n = body.refs.length
    const attrs = new Float32Array(n * 4)
    body.refs.forEach((r, i) => attrs.set([r.color[0] / 255, r.color[1] / 255, r.color[2] / 255, r.role * 0.25], i * 4))
    ;[index] = MeshoptSimplifier.simplifyWithAttributes(index, body.pos, 3, attrs, 4, [0.6, 0.6, 0.6, 1.5], null, target * 3, 0.2, [])
    if (index.length / 3 > target * 1.4) [index] = MeshoptSimplifier.simplifySloppy(index, body.pos, 3, null, target * 3, 0.1)
  }
  // varfurile renumerotate in ordinea primei folosiri: diferentele mici se comprima bine
  const used = new Map()
  const keep = []
  const tris = []
  for (const i of index) {
    let j = used.get(i)
    if (j === undefined) {
      j = keep.length
      used.set(i, j)
      keep.push(i)
    }
    tris.push(j)
  }
  return { keep, index: tris }
}

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

// ---------------------------------------------------------------- personajele

await MeshoptSimplifier.ready

// pozele fiecaruia; unii mai ridica si cealalta mana, unul merge prin multime
const EXTRA = { hoodie: ['cheer', 'pump'], punk: ['cheer', 'pump'], woman: ['cheer', 'pump'], casual: ['walk', 'cheer', 'pump'] }

const chars = []
for (const c of CHARACTERS) {
  const { gltf, palette } = await load(c)
  const rig = rigOf(gltf)
  const mixer = new THREE.AnimationMixer(gltf.scene)
  const poses = ['high', 'eye', ...(EXTRA[c.id] ?? [])]

  // topologia vine din poza de repaus; pozele doar muta aceleasi varfuri
  mixer.clipAction(clipFor(gltf, /(^|\|)(Female_)?Idle$/)).play()
  mixer.setTime(0.4)
  gltf.scene.updateMatrixWorld(true)
  const all = collect(gltf, palette)
  const body = weld(all.refs, posed(all.refs), all.index)

  const paletteKeys = []
  const colorOf = (r) => {
    const key = `${r.color.join(',')},${r.role}`
    let k = paletteKeys.indexOf(key)
    if (k < 0) k = paletteKeys.push(key) - 1
    return k
  }

  const lods = LODS.map((target) => {
    const s = simplify(body, target)
    return { keep: s.keep, index: s.index, colors: s.keep.map((i) => colorOf(body.refs[i])), poses: [] }
  })

  for (const name of poses) {
    const frame = pose(gltf, rig, name, mixer, body.refs)
    const P = posed(body.refs)
    lods.forEach((lod, level) => {
      const n = lod.keep.length
      const pos = new Float32Array(n * 3)
      lod.keep.forEach((i, k) => pos.set([P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], k * 3))
      const nrm = smoothNormals(pos, lod.index)
      const ph = phone(rig, frame, level)
      // talpile la y = 0, telefonul la (0, 1, 0)
      let minY = Infinity
      for (let i = 1; i < pos.length; i += 3) minY = Math.min(minY, pos[i])
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
      lod.poses.push({ name, pos: norm([...pos, ...ph.pos]), nrm: Float32Array.from([...nrm, ...ph.nrm]), height: (Math.max(...pos.filter((_, i) => i % 3 === 1)) - minY) * k })
      if (!lod.phone) {
        lod.phone = { start: n, tris: lod.index.length / 3, role: ph.role, screen: ph.screen, index: ph.index.map((i) => i + n) }
      }
    })
  }
  const palette8 = paletteKeys.map((key) => key.split(',').map(Number))
  chars.push({ id: c.id, title: c.title, palette: palette8, poses, lods })
  console.log(`${c.id}: ${poses.join(', ')} · ${lods.map((l) => `${l.index.length / 3}+${l.phone.index.length / 3} tri / ${l.keep.length} v`).join(', ')} · ${palette8.length} culori`)
}

// ---------------------------------------------------------------- fisierul

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
const header = { box: [lo, hi], roles: ROLE, chars: [] }
for (const c of chars) {
  header.chars.push({
    id: c.id,
    palette: c.palette,
    poses: c.poses,
    lods: c.lods.map((l) => {
      const n = l.keep.length
      const total = n + l.phone.role.length
      const idx = [...l.index, ...l.phone.index]
      const col = Uint8Array.from([...l.colors, ...l.phone.role.map((r) => 255 - r)])
      const scr = Int8Array.from(l.phone.screen.map((v) => Math.round(Math.max(-1, Math.min(1, v)) * 127)))
      return {
        count: total,
        body: l.index.length,
        tris: idx.length / 3,
        phone: n,
        idx: push(delta16(idx)),
        col: push(col),
        scr: push(scr),
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
header.credits = CHARACTERS.map((c) => `${c.title} · Quaternius · CC0 · https://poly.pizza`)
const text = new TextEncoder().encode(JSON.stringify(header))
const headLen = text.length + ((4 - (text.length % 4)) % 4)
const file = new Uint8Array(8 + headLen + size)
file.set(new TextEncoder().encode('PPL2'), 0)
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
