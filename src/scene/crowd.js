import * as THREE from 'three'
import { BOUNCE } from './people.js'
import { blocked, inside, LAYOUT, SPOTS, STAGE, STAGE2, zone } from './world.js'

export function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Amestecare care depinde doar de seed. Un sort cu comparator la intamplare da alt rezultat in fiecare browser. */
export function shuffle(list, rand) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  return list
}

export const LINK_RANGE = 10.5
/** Cat de repede trece primul ping peste multime, in unitati pe secunda. */
export const WAKE_SPEED = 36
const HOP_TIME = 0.5
const NEVER = 1e6

const TAU = Math.PI * 2

/**
 * Oamenii din multime, fiecare cu telefonul ridicat. Toate telefoanele se vad ca lumini; o parte au aplicatia si
 * formeaza reteaua. Asezarea urmeaza zonele din venue.json: lume deasa in fata scenelor, ciorchini la baruri si
 * la mancare. `energy` spune cat sare omul pe ritm, `face` incotro priveste.
 */
export function generate(density = 1) {
  const rand = rng(20261005)
  const gauss = () => {
    let u = 0
    let v = 0
    while (!u) u = rand()
    while (!v) v = rand()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }
  const phones = []
  const [youX, youZ] = SPOTS.you
  const toward = (x, z, tx, tz, spread) => Math.atan2(tx - x, tz - z) + (rand() - 0.5) * spread
  const add = (x, z, energy = 0.08, face = rand() * TAU) => {
    // nimeni nu sta pe o constructie si nici sub pin
    if (blocked(x, z) || Math.hypot(x - youX, z - youZ) < 2.7) return false
    phones.push({ x, z, y: 1.35 + rand() * 0.6, app: rand() < 0.05, seed: rand(), energy, face })
    return true
  }

  const fill = (zn, count, weight, who) => {
    let placed = 0
    for (let tries = 0; placed < count && tries < count * 60; tries++) {
      const x = zn.x0 + rand() * (zn.x1 - zn.x0)
      const z = zn.z0 + rand() * (zn.z1 - zn.z0)
      if (!inside(zn.pts, x, z) || rand() > weight(x, z)) continue
      const [energy, face] = who ? who(x, z) : [undefined, undefined]
      if (add(x, z, energy, face)) placed++
    }
  }
  const blob = (cx, cz, sx, sz, count, tx = cx, tz = cz) => {
    for (let i = 0; i < count; i++) {
      const x = cx + gauss() * sx
      const z = cz + gauss() * sz
      add(x, z, 0.08, toward(x, z, tx, tz, 1.6))
    }
  }
  const n = (v) => Math.round(v * density)

  // in fata scenei mari: toti cu fata la scena, iar primele randuri sar cel mai tare
  const ms = zone['main-stage']
  fill(ms, n(3300), (x, z) => {
    if (z < STAGE.barrier + 0.9) return 0
    const t = (z - ms.z0) / (ms.z1 - ms.z0)
    return 0.22 + 0.78 * Math.pow(1 - t, 1.5)
  }, (x, z) => {
    const t = (z - ms.z0) / (ms.z1 - ms.z0)
    return [(0.3 + 0.7 * (1 - t)) * (0.45 + 0.55 * rand()), toward(x, z, STAGE.x, STAGE.front, 0.5)]
  })

  const s2 = zone['second-stage']
  fill(s2, n(760), (x) => {
    if (x > STAGE2.x - 3.5) return 0
    const t = (x - s2.x0) / (s2.x1 - s2.x0)
    return 0.15 + 0.85 * Math.pow(t, 1.6)
  }, (x, z) => {
    const t = (x - s2.x0) / (s2.x1 - s2.x0)
    return [(0.2 + 0.6 * t) * (0.4 + 0.6 * rand()), toward(x, z, STAGE2.x, STAGE2.z, 0.6)]
  })

  // la baruri, lumea sta cu fata la tejghea
  const bar = zone.bar
  fill(bar, n(330), () => 0.5)
  for (const b of LAYOUT.bars) {
    const long = b.d > b.w
    blob(b.x, b.z, long ? 3.4 : 6.6, long ? 6 : 3.2, n(150), b.x, b.z)
  }

  const food = zone.food
  fill(food, n(230), () => 0.6)
  for (const t of LAYOUT.trucks) blob(t.x, t.z + t.face * 3.4, 2.4, 1.5, n(34), t.x, t.z)

  // cozile de la porti
  const ent = zone.entrance
  for (const gx of LAYOUT.gates.xs) {
    for (let i = 0; i < n(55); i++) add(gx + gauss() * 0.7, ent.z0 + 2 + rand() * (ent.z1 - ent.z0 - 7), 0.04, Math.PI + (rand() - 0.5) * 0.5)
  }
  fill(zone.camping, n(120), () => 0.4)
  fill(zone.chill, n(160), (x, z) => 0.3 + 0.7 * Math.exp(-((x - 66) ** 2 + (z - 52) ** 2) / 160))

  // lumea care merge intre scena si baruri
  for (let i = 0; i < n(200); i++) add(-34 + rand() * 68, ms.z1 - 1 + rand() * (bar.z0 - ms.z1 + 2))
  for (let i = 0; i < n(90); i++) add(-24 + rand() * 18, ms.z1 - 4 + rand() * 12)

  // pe alei, intre zone
  for (let i = 0; i < n(260); i++) {
    const r = rand()
    if (r < 0.5) add(-90 + rand() * 180, 23 + rand() * 12)
    else if (r < 0.75) add(36 + rand() * 12, -12 + rand() * 46)
    else add(-48 + rand() * 13, -12 + rand() * 40)
  }

  return phones
}

/**
 * Legaturile, ca in protocol: fiecare telefon porneste cel mult 4 si primeste cel mult 3. Doua merg spre
 * vecinii cei mai apropiati, celelalte spre oricine e in raza. Apoi grupurile apropiate se leaga intre ele,
 * cum face rotatia legaturilor din aplicatie cand sloturile sunt pline si exista vecini nelegati.
 */
export function link(nodes, rand) {
  const R = LINK_RANGE
  const cell = (v) => Math.floor(v / R)
  const grid = new Map()
  nodes.forEach((p, i) => {
    const k = `${cell(p.x)},${cell(p.z)}`
    if (!grid.has(k)) grid.set(k, [])
    grid.get(k).push(i)
  })
  const dist = (i, j) => Math.hypot(nodes[j].x - nodes[i].x, nodes[j].z - nodes[i].z)
  const near = (i, range = R) => {
    const p = nodes[i]
    const found = []
    const reach = Math.ceil(range / R)
    for (let dx = -reach; dx <= reach; dx++) {
      for (let dz = -reach; dz <= reach; dz++) {
        for (const j of grid.get(`${cell(p.x) + dx},${cell(p.z) + dz}`) ?? []) {
          if (j === i || nodes[j].isolated) continue
          const d = dist(i, j)
          if (d <= range) found.push([d, j])
        }
      }
    }
    return found.sort((a, b) => a[0] - b[0]).map((f) => f[1])
  }
  const out = new Uint8Array(nodes.length)
  const inc = new Uint8Array(nodes.length)
  const adj = nodes.map(() => new Set())
  const connect = (a, b) => {
    adj[a].add(b)
    adj[b].add(a)
    out[a]++
    inc[b]++
  }
  const free = (a, b) => !adj[a].has(b) && inc[b] < 3 && adj[a].size < 7 && adj[b].size < 7
  const order = shuffle(nodes.map((_, i) => i), rand)
  for (const a of order) {
    if (nodes[a].isolated) continue
    const cands = near(a)
    const nearest = cands.slice(0, 4)
    const others = shuffle(cands.slice(4), rand)
    for (const b of [...nearest.slice(0, 2), ...others, ...nearest.slice(2)]) {
      if (out[a] >= 4) break
      if (free(a, b)) connect(a, b)
    }
  }

  // grupurile ramase separate se leaga prin perechea cea mai apropiata, daca e in raza
  for (let pass = 0; pass < 40; pass++) {
    const comp = new Int32Array(nodes.length).fill(-1)
    let count = 0
    nodes.forEach((p, i) => {
      if (p.isolated || comp[i] >= 0) return
      const stack = [i]
      comp[i] = count
      while (stack.length) for (const v of adj[stack.pop()]) if (comp[v] < 0) { comp[v] = count; stack.push(v) }
      count++
    })
    if (count <= 1) break
    const sizes = new Int32Array(count)
    comp.forEach((c) => { if (c >= 0) sizes[c]++ })
    const main = sizes.indexOf(Math.max(...sizes))
    let best = null
    nodes.forEach((p, i) => {
      if (p.isolated || comp[i] !== main) return
      for (const j of near(i, R * 1.6)) {
        if (comp[j] === comp[i]) continue
        const d = dist(i, j)
        if (!best || d < best[0]) best = [d, i, j]
      }
    })
    if (!best) break
    connect(best[1], best[2])
  }
  return adj
}

/**
 * Un pachet trimis cu ttl 7: fiecare telefon il da mai departe o singura data, pe toate legaturile
 * in afara de cea pe care a venit, dupa o pauza de 50-250 ms. Destinatarul il pastreaza.
 */
export function flood(adj, src, { ttl = 7, dest = -1, seed = 1 } = {}) {
  const rand = rng(seed)
  const count = adj.length
  const t = new Float32Array(count).fill(NEVER)
  const hop = new Int16Array(count).fill(-1)
  const parent = new Int32Array(count).fill(-1)
  const relay = new Float32Array(count).fill(NEVER)
  const done = new Uint8Array(count)
  t[src] = 0
  hop[src] = 0
  for (;;) {
    let u = -1
    let best = NEVER
    for (let i = 0; i < count; i++) if (!done[i] && t[i] < best) { best = t[i]; u = i }
    if (u < 0) break
    done[u] = 1
    if (u !== src && (hop[u] >= ttl || u === dest)) continue
    relay[u] = t[u] + (u === src ? 0 : 0.1 + rand() * 0.4)
    for (const v of adj[u]) {
      if (v === parent[u]) continue
      const tv = relay[u] + HOP_TIME
      if (tv < t[v]) {
        t[v] = tv
        hop[v] = hop[u] + 1
        parent[v] = u
      }
    }
  }
  const path = (to) => {
    const p = []
    for (let v = to; v >= 0; v = parent[v]) p.unshift(v)
    return p[0] === src ? p : []
  }
  return { t, hop, parent, relay, path }
}

const pointsVertex = /* glsl */ `
  attribute float aSeed;
  attribute float aApp;
  attribute float aTa;
  attribute float aTb;
  attribute float aRev;
  attribute float aEnergy;
  uniform float uTime, uSize, uDpr, uCrowd, uMesh, uReveal, uFa, uFb, uDim, uRingSpeed;
  uniform vec3 uWake;
  uniform vec3 uColA, uColB;
  uniform vec4 uRing[3];
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  varying vec3 vCol;
  varying float vA;
  varying float vPx;

  ${BOUNCE}
  float flash(float since) { return since < 0.0 ? 0.0 : exp(-since * 2.6); }
  float held(float since) { return since < 0.0 ? 0.0 : exp(-since * 0.22); }

  void main() {
    vec3 at = position;
    at.y += bounce(aSeed, aEnergy, position.xz);
    vec4 mv = modelViewMatrix * vec4(at, 1.0);
    gl_Position = projectionMatrix * mv;
    // lumina sta in mijlocul telefonului din mana; adancimea ei e adusa putin in fata, ca telefonul sa nu o acopere
    vec4 ahead = projectionMatrix * (mv + vec4(0.0, 0.0, 0.3, 0.0));
    gl_Position.z = ahead.z / ahead.w * gl_Position.w;
    float d = max(-mv.z, 0.1);
    float s1 = fract(aSeed * 7.13);
    float tw = 0.7 + 0.3 * sin(uTime * (0.6 + s1 * 2.1) + aSeed * 37.0);
    float lowered = smoothstep(0.9, 1.0, sin(uTime * 0.17 + aSeed * 91.0));

    float ring = 0.0;
    for (int i = 0; i < 3; i++) {
      vec4 r = uRing[i];
      float age = uTime - r.z;
      if (age > 0.0 && age < 3.4) {
        float dd = length(position.xz - r.xy) - age * uRingSpeed;
        ring += r.w * exp(-dd * dd / 4.0) * (1.0 - age / 3.4);
      }
    }

    float rev = uMesh * aApp * smoothstep(aRev + 2.0, aRev - 1.0, uReveal);
    float sa = uFa - aTa;
    float sb = uFb - aTb;
    float fl = (flash(sa) + flash(sb)) * aApp;
    float ha = held(sa) * aApp;
    float hb = held(sb) * aApp;

    vec3 col = vec3(0.80, 0.86, 0.92) * (0.6 + 0.4 * tw);
    float alpha = uCrowd * (0.5 + 0.3 * tw) * (1.0 - 0.85 * lowered);
    alpha *= 1.0 - uDim * (1.0 - aApp) * 0.78;
    col = mix(col, vec3(0.19, 0.82, 0.35), rev);
    alpha = mix(alpha, 0.9, rev);
    col = mix(col, uColA, clamp(ha, 0.0, 1.0));
    col = mix(col, uColB, clamp(hb, 0.0, 1.0));
    alpha = max(alpha, 0.85 * max(ha, hb));

    // la incarcare telefoanele sunt stinse; se aprind cand trece peste ele primul ping al pinului
    float wake = clamp((uTime - uWake.z - length(position.xz - uWake.xy) / ${WAKE_SPEED.toFixed(1)}) / 0.5, 0.0, 1.0);
    alpha *= 0.07 + 0.93 * wake;

    float f = clamp(fl + ring * (0.3 + 0.7 * aApp) + wake * (1.0 - wake) * 3.2, 0.0, 1.4);
    col = mix(col, vec3(0.93, 1.0, 0.95), clamp(f, 0.0, 1.0));

    float size = (1.0 + 0.6 * aApp) * (1.0 + 1.5 * f + 0.35 * rev + 0.5 * max(ha, hb));
    gl_PointSize = clamp(size * uSize * uDpr / d, 2.6 * uDpr, 90.0 * uDpr);
    vPx = gl_PointSize / uDpr;
    // de aproape lumineaza ecranul din mana omului; aici ramane doar aura si ce spune povestea
    float held2 = max(max(ha, hb), rev);
    alpha *= 1.0 - 0.62 * smoothstep(9.0, 24.0, vPx) * (1.0 - held2);
    alpha = clamp(alpha + f, 0.0, 1.0);
    float fog = 1.0 - exp(-uFogDensity * uFogDensity * d * d);
    vCol = col;
    vA = alpha * (1.0 - fog * 0.85);
  }
`

const pointsFragment = /* glsl */ `
  varying vec3 vCol;
  varying float vA;
  varying float vPx;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(p, p);
    if (r2 > 1.0) discard;
    float core = mix(exp(-r2 * 10.0), 1.0 - smoothstep(0.25, 0.55, sqrt(r2)), smoothstep(6.0, 3.0, vPx));
    float halo = exp(-r2 * 3.0) * 0.32;
    float a = (core + halo) * vA;
    gl_FragColor = vec4(vCol * a, 1.0);
    #include <colorspace_fragment>
  }
`

const edgeVertex = /* glsl */ `
  attribute vec3 aA;
  attribute vec3 aB;
  attribute vec2 aFa;
  attribute vec2 aFb;
  attribute vec2 aRev;
  attribute float aYou;
  attribute vec4 aBob;
  uniform vec2 uView;
  uniform float uWidth, uDpr;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  varying float vS;
  varying float vAcross;
  varying vec2 vFa;
  varying vec2 vFb;
  varying vec2 vRev;
  varying float vYou;
  varying float vFog;
  ${BOUNCE}
  void main() {
    vec3 A = aA;
    vec3 B = aB;
    A.y += bounce(aBob.x, aBob.y, aA.xz);
    B.y += bounce(aBob.z, aBob.w, aB.xz);
    vec4 ca = projectionMatrix * modelViewMatrix * vec4(A, 1.0);
    vec4 cb = projectionMatrix * modelViewMatrix * vec4(B, 1.0);
    if (ca.w < 0.2 || cb.w < 0.2) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
    vec2 sa = ca.xy / ca.w * uView;
    vec2 sb = cb.xy / cb.w * uView;
    vec2 dir = normalize(sb - sa + vec2(1e-5));
    vec2 nrm = vec2(-dir.y, dir.x);
    vec4 c = mix(ca, cb, position.x);
    c.xy += nrm * position.y * uWidth * uDpr / uView * c.w;
    gl_Position = c;
    vS = position.x;
    vAcross = position.y;
    vFa = aFa;
    vFb = aFb;
    vRev = aRev;
    vYou = aYou;
    vec4 mv = modelViewMatrix * vec4(mix(A, B, position.x), 1.0);
    float d = -mv.z;
    vFog = 1.0 - exp(-uFogDensity * uFogDensity * d * d);
  }
`

const edgeFragment = /* glsl */ `
  uniform float uMesh, uReveal, uFa, uFb, uHop, uYouLinks, uTime, uBase;
  uniform vec3 uColA, uColB;
  varying float vS;
  varying float vAcross;
  varying vec2 vFa;
  varying vec2 vFb;
  varying vec2 vRev;
  varying float vYou;
  varying float vFog;

  // capul valului care merge pe legatura, din A spre B si din B spre A, plus urma lasata
  vec2 channel(float now, vec2 start) {
    float pa = (now - start.x) / uHop;
    float pb = (now - start.y) / uHop;
    float head = 0.0;
    float trail = 0.0;
    if (pa > 0.0) {
      float da = (vS - pa) * 9.0;
      head += pa < 1.2 ? exp(-da * da) : 0.0;
      trail = max(trail, step(vS, pa) * exp(-max(pa - 1.0, 0.0) * 0.45));
    }
    if (pb > 0.0) {
      float db = ((1.0 - vS) - pb) * 9.0;
      head += pb < 1.2 ? exp(-db * db) : 0.0;
      trail = max(trail, step(1.0 - vS, pb) * exp(-max(pb - 1.0, 0.0) * 0.45));
    }
    return vec2(head, trail);
  }

  void main() {
    float across = 1.0 - abs(vAcross);
    float soft = smoothstep(0.0, 0.9, across);
    float grow = clamp((uReveal - vRev.x) / max(vRev.y - vRev.x, 0.5), 0.0, 1.0);
    float built = uMesh * step(vS, grow) * step(0.001, grow);
    float dg = (vS - grow) * 10.0;
    float tip = uMesh * (grow > 0.0 && grow < 1.0 ? exp(-dg * dg) : 0.0);
    float you = vYou * uYouLinks;
    vec2 a = channel(uFa, vFa);
    vec2 b = channel(uFb, vFb);
    vec3 green = vec3(0.19, 0.82, 0.35);
    vec3 mesh = mix(vec3(0.3, 0.42, 0.34), green, smoothstep(0.12, 0.3, uBase));
    vec3 col = mesh * uBase * built + green * 0.6 * you + vec3(0.8, 1.0, 0.85) * tip * 0.8;
    col += uColA * (a.y * 0.62) + vec3(0.95, 1.0, 0.96) * a.x * 1.8;
    col += uColB * (b.y * 0.62) + vec3(0.95, 1.0, 0.96) * b.x * 1.8;
    float alpha = soft * (1.0 - vFog * 0.9);
    gl_FragColor = vec4(col * alpha, 1.0);
    #include <colorspace_fragment>
  }
`

/** Lumini si legaturi, cu doua canale de val: A (mesajul sau raportul) si B (confirmarea). */
export function createCrowd({ density = 1 } = {}) {
  const phones = generate(density)
  const rand = rng(99)

  // locurile povestii primesc telefoane cu aplicatia
  const special = {}
  for (const [name, [x, z]] of Object.entries(SPOTS)) {
    if (name === 'meeting') continue
    special[name] = phones.length
    const face = name === 'reporter' ? Math.atan2(STAGE.x - x, STAGE.front - z) : name === 'tent' ? Math.PI : rand() * TAU
    // pinul esti tu, deci acolo nu mai sta un om
    phones.push({ x, z, y: name === 'you' ? 1.7 : 1.75, app: true, seed: rand(), energy: 0, face, isolated: name === 'tent', figure: name !== 'you' })
  }

  const appIdx = []
  phones.forEach((p, i) => { if (p.app) appIdx.push(i) })
  const nodes = appIdx.map((i) => phones[i])
  const nodeOf = new Map(appIdx.map((pi, ni) => [pi, ni]))
  const adj = link(nodes, rand)
  const youNode = nodeOf.get(special.you)

  // Ana e la trei salturi de tine, echipa medicala la cinci de cel care raporteaza
  const pick = (from, hops, target, filter = () => true) => {
    const f = flood(adj, from, { ttl: 12, seed: 3 })
    for (const [h, keep] of [[hops, filter], [hops + 1, filter], [hops + 2, filter], [hops - 1, filter], [hops, () => true]]) {
      let best = -1
      let bestD = Infinity
      nodes.forEach((p, i) => {
        if (f.hop[i] !== h || !keep(p)) return
        const d = Math.hypot(p.x - target[0], p.z - target[1])
        if (d < bestD) { bestD = d; best = i }
      })
      if (best >= 0) return best
    }
    return from
  }
  const anaNode = pick(youNode, 3, SPOTS.ana, (p) => inside(zone.bar.pts, p.x, p.z))
  const reporterNode = nodeOf.get(special.reporter)
  const medicNode = pick(reporterNode, 5, SPOTS.medic)

  const scenarios = {
    message: flood(adj, youNode, { dest: anaNode, seed: 11 }),
    delivered: flood(adj, anaNode, { dest: youNode, seed: 12 }),
    report: flood(adj, reporterNode, { seed: 13 }),
    ack: flood(adj, medicNode, { seed: 14 }),
  }

  // ---- luminile ----
  const count = phones.length
  const pos = new Float32Array(count * 3)
  const seed = new Float32Array(count)
  const app = new Float32Array(count)
  const rev = new Float32Array(count)
  const energy = new Float32Array(count)
  const ta = new Float32Array(count).fill(NEVER)
  const tb = new Float32Array(count).fill(NEVER)
  const you = phones[special.you]
  phones.forEach((p, i) => {
    pos.set([p.x, p.y, p.z], i * 3)
    seed[i] = p.seed
    app[i] = p.app ? 1 : 0
    rev[i] = Math.hypot(p.x - you.x, p.z - you.z)
    energy[i] = p.energy
  })
  const pointsGeo = new THREE.BufferGeometry()
  pointsGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  pointsGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
  pointsGeo.setAttribute('aApp', new THREE.BufferAttribute(app, 1))
  pointsGeo.setAttribute('aRev', new THREE.BufferAttribute(rev, 1))
  pointsGeo.setAttribute('aEnergy', new THREE.BufferAttribute(energy, 1))
  pointsGeo.setAttribute('aTa', new THREE.BufferAttribute(ta, 1))
  pointsGeo.setAttribute('aTb', new THREE.BufferAttribute(tb, 1))

  const shared = {
    uTime: { value: 0 },
    uDpr: { value: 1 },
    uMesh: { value: 0 },
    uReveal: { value: 0 },
    uFa: { value: -10 },
    uFb: { value: -10 },
    uColA: { value: new THREE.Color('#30D158') },
    uColB: { value: new THREE.Color('#D3D8B2') },
    uFogColor: { value: new THREE.Color('#0E110F') },
    uFogDensity: { value: 0.0042 },
    uBeat: { value: 0 },
    uBob: { value: 1 },
    uStageXZ: { value: new THREE.Vector2(STAGE.x, STAGE.front) },
  }
  const pointsMat = new THREE.ShaderMaterial({
    vertexShader: pointsVertex,
    fragmentShader: pointsFragment,
    uniforms: {
      ...shared,
      uSize: { value: 92 },
      uCrowd: { value: 1 },
      uDim: { value: 0 },
      uRingSpeed: { value: 15 },
      uRing: { value: [new THREE.Vector4(0, 0, -99, 0), new THREE.Vector4(0, 0, -99, 0), new THREE.Vector4(0, 0, -99, 0)] },
      uWake: { value: new THREE.Vector3(you.x, you.z, 1e6) },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const points = new THREE.Points(pointsGeo, pointsMat)
  points.frustumCulled = false

  // ---- legaturile ----
  const pairs = []
  adj.forEach((set, a) => set.forEach((b) => { if (a < b) pairs.push([a, b]) }))
  const E = pairs.length
  const quad = new THREE.InstancedBufferGeometry()
  quad.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0]), 3))
  quad.setIndex([0, 1, 2, 0, 2, 3])
  const eA = new Float32Array(E * 3)
  const eB = new Float32Array(E * 3)
  const eRev = new Float32Array(E * 2)
  const eYou = new Float32Array(E)
  const eBob = new Float32Array(E * 4)
  const eFa = new Float32Array(E * 2).fill(NEVER)
  const eFb = new Float32Array(E * 2).fill(NEVER)
  pairs.forEach(([a, b], i) => {
    let p = nodes[a]
    let q = nodes[b]
    let da = Math.hypot(p.x - you.x, p.z - you.z)
    let db = Math.hypot(q.x - you.x, q.z - you.z)
    if (db < da) {
      ;[p, q] = [q, p]
      ;[da, db] = [db, da]
      pairs[i] = [b, a]
    }
    eA.set([p.x, p.y, p.z], i * 3)
    eB.set([q.x, q.y, q.z], i * 3)
    eRev.set([da, db], i * 2)
    eBob.set([p.seed, p.energy, q.seed, q.energy], i * 4)
    eYou[i] = pairs[i][0] === youNode || pairs[i][1] === youNode ? 1 : 0
  })
  quad.setAttribute('aA', new THREE.InstancedBufferAttribute(eA, 3))
  quad.setAttribute('aB', new THREE.InstancedBufferAttribute(eB, 3))
  quad.setAttribute('aRev', new THREE.InstancedBufferAttribute(eRev, 2))
  quad.setAttribute('aYou', new THREE.InstancedBufferAttribute(eYou, 1))
  quad.setAttribute('aBob', new THREE.InstancedBufferAttribute(eBob, 4))
  quad.setAttribute('aFa', new THREE.InstancedBufferAttribute(eFa, 2))
  quad.setAttribute('aFb', new THREE.InstancedBufferAttribute(eFb, 2))
  quad.instanceCount = E

  const edgeMat = new THREE.ShaderMaterial({
    vertexShader: edgeVertex,
    fragmentShader: edgeFragment,
    uniforms: {
      ...shared,
      uView: { value: new THREE.Vector2(1, 1) },
      uWidth: { value: 1.7 },
      uHop: { value: HOP_TIME },
      uYouLinks: { value: 0 },
      uBase: { value: 0.3 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const edges = new THREE.Mesh(quad, edgeMat)
  edges.frustumCulled = false

  const group = new THREE.Group()
  group.add(edges, points)

  const loaded = { a: null, b: null }
  /** Pune un val (mesaj, confirmare, raport, ack) pe canalul A sau B. */
  function load(channel, name) {
    if (loaded[channel] === name) return
    loaded[channel] = name
    const sc = name ? scenarios[name] : null
    const nodeT = pointsGeo.getAttribute(channel === 'a' ? 'aTa' : 'aTb')
    const edgeT = quad.getAttribute(channel === 'a' ? 'aFa' : 'aFb')
    nodeT.array.fill(NEVER)
    edgeT.array.fill(NEVER)
    if (sc) {
      appIdx.forEach((pi, ni) => { nodeT.array[pi] = sc.t[ni] })
      pairs.forEach(([a, b], i) => {
        edgeT.array[i * 2] = sc.relay[a] < NEVER && sc.parent[a] !== b ? sc.relay[a] : NEVER
        edgeT.array[i * 2 + 1] = sc.relay[b] < NEVER && sc.parent[b] !== a ? sc.relay[b] : NEVER
      })
    }
    nodeT.needsUpdate = true
    edgeT.needsUpdate = true
  }

  const node = (ni) => nodes[ni]
  return {
    group,
    phones,
    uniforms: { points: pointsMat.uniforms, edges: edgeMat.uniforms, shared },
    load,
    scenarios,
    you: node(youNode),
    ana: node(anaNode),
    reporter: node(reporterNode),
    medic: node(medicNode),
    tent: phones[special.tent],
    holders: ['hold', 'holdB', 'holdC'].map((name) => phones[special[name]]),
    nodes,
    ids: { you: youNode, ana: anaNode, reporter: reporterNode, medic: medicNode },
    hops: { ana: scenarios.message.hop[anaNode] },
    path: {
      message: scenarios.message.path(anaNode).map(node),
      report: scenarios.report.path(medicNode).map(node),
    },
    times: {
      ana: scenarios.message.t[anaNode],
      delivered: scenarios.delivered.t[youNode],
      medic: scenarios.report.t[medicNode],
      ack: scenarios.ack.t[reporterNode],
    },
  }
}
