// Festivalul din scena e harta din aplicatie (venue.json, copiat din proiectul Android), adusa la scara scenei.
import venue from '../data/venue.json' with { type: 'json' }

export const UNIT = 2.5 // metri intr-o unitate a scenei

const lat0 = (venue.bounds.minLat + venue.bounds.maxLat) / 2
const lon0 = (venue.bounds.minLon + venue.bounds.maxLon) / 2
const kx = (111320 * Math.cos((lat0 * Math.PI) / 180)) / UNIT
const kz = 110574 / UNIT

/** Latitudine si longitudine in [x, z]; nordul e spre -z. */
export function geo(lat, lon) {
  return [(lon - lon0) * kx, -(lat - lat0) * kz]
}

export const bounds = (() => {
  const [x0, z1] = geo(venue.bounds.minLat, venue.bounds.minLon)
  const [x1, z0] = geo(venue.bounds.maxLat, venue.bounds.maxLon)
  return { x0, x1, z0, z1 }
})()

export const zones = venue.zones.map((z, index) => {
  const pts = z.polygon.map((p) => geo(p.lat, p.lon))
  const xs = pts.map((p) => p[0])
  const zs = pts.map((p) => p[1])
  return {
    id: z.id,
    name: z.name,
    type: z.type ?? null,
    index,
    pts,
    cx: xs.reduce((a, b) => a + b, 0) / xs.length,
    cz: zs.reduce((a, b) => a + b, 0) / zs.length,
    x0: Math.min(...xs),
    x1: Math.max(...xs),
    z0: Math.min(...zs),
    z1: Math.max(...zs),
  }
})

export const zone = Object.fromEntries(zones.map((z) => [z.id, z]))
export const meeting = geo(venue.meetingPoint.lat, venue.meetingPoint.lon)

/** Punctele utile (iesiri, toalete, apa, informatii, incarcare) si aleile dintre zone. */
export const pois = (venue.pois ?? []).map((p) => ({ type: p.type, name: p.name, at: geo(p.lat, p.lon) }))
export const paths = (venue.paths ?? []).map((line) => line.map((p) => geo(p.lat, p.lon)))

export function inside(pts, x, z) {
  let hit = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i]
    const [xj, zj] = pts[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit
  }
  return hit
}

const ms = zone['main-stage']
const s2 = zone['second-stage']

/** Scena mare sta la marginea de nord a zonei ei, cu fata spre multime. */
export const STAGE = { x: 0, front: ms.z0 + 0.4, back: ms.z0 - 7.6, half: 16, barrier: ms.z0 + 2.4 }
/** In spatele scenei mari, dincolo de gardul festivalului: zona de productie (vezi backstage.js). */
export const BACKSTAGE = { x0: -44, x1: 44, z0: STAGE.back - 26, z1: STAGE.back - 1 }
/** Scena 2 sta la marginea de est a zonei ei, cu fata spre vest. */
export const STAGE2 = { x: s2.x1 - 3, z: (s2.z0 + s2.z1) / 2 + 2, half: 7 }

const tentAt = [(zone.medical.x0 + zone.medical.x1) / 2, (zone.medical.z0 + zone.medical.z1) / 2 + 1]

/**
 * Locurile povestii: tu (pinul), Ana, cel care raporteaza, echipa medicala si cele trei telefoane de la
 * marginea multimii care pastreaza raportul cat timp cortul medical e prea departe.
 */
export const SPOTS = {
  you: [-9, -21],
  ana: [-15, -5],
  reporter: [9, ms.z0 + 6],
  medic: [33, ms.z0 + 30],
  tent: tentAt,
  hold: [tentAt[0] - 6, tentAt[1] - 27],
  holdB: [tentAt[0] - 8.6, tentAt[1] - 28.3],
  holdC: [tentAt[0] - 4.3, tentAt[1] - 29.4],
  meeting,
}

/** Unde stau constructiile. Multimea le ocoleste, iar modelele si luminile de pe sol pornesc tot de aici. */
const food = zone.food
export const LAYOUT = {
  bars: [
    { x: -20, z: 2, w: 4.4, d: 15 },
    { x: 20, z: 2, w: 4.4, d: 15 },
    { x: 0, z: 18.2, w: 17, d: 4.4 },
  ],
  // doua randuri de rulote, fata in fata: cele din nord servesc spre sud si invers
  trucks: [0, 1, 2, 3].flatMap((i) => [
    { x: food.x0 + 8 + i * 11, z: food.z0 + 3.2, face: 1, tone: i },
    { x: food.x0 + 8 + i * 11, z: food.z1 - 3.2, face: -1, tone: (i + 2) % 4 },
  ]),
  // cortul medical sta in spatele telefonului echipei, deschis spre nord si spre vest
  tent: { x: SPOTS.tent[0] + 0.6, z: SPOTS.tent[1] + 3.9, w: 8.4, d: 6.2 },
  // turnul de mixaj (FOH) in mijlocul multimii, putin intr-o parte, si doua turnuri de boxe pentru cei din spate
  foh: { x: 3, z: STAGE.front + 24, w: 6.4, d: 5.2 },
  delays: [-17, 17].map((x) => ({ x, z: STAGE.front + 25 })),
  gates: { xs: [-35, -24, -13], z: zone.entrance.z1 - 2.5 },
}

/** Adevarat daca punctul cade pe o constructie: acolo nu sta nimeni. */
export function blocked(x, z, pad = 0.45) {
  const hit = (cx, cz, hw, hd) => Math.abs(x - cx) < hw + pad && Math.abs(z - cz) < hd + pad
  for (const b of LAYOUT.bars) if (hit(b.x, b.z, b.w / 2, b.d / 2)) return true
  for (const t of LAYOUT.trucks) if (hit(t.x, t.z, 3.2, 1.35)) return true
  const t = LAYOUT.tent
  if (hit(t.x, t.z, t.w / 2, t.d / 2)) return true
  for (const gx of LAYOUT.gates.xs) if (hit(gx - 2.6, LAYOUT.gates.z, 0.5, 0.9) || hit(gx + 2.6, LAYOUT.gates.z, 0.5, 0.9)) return true
  return false
}

/**
 * Turnul de mixaj si turnurile de boxe au venit dupa multime: cine ar sta pe ele face un pas pana la marginea lor,
 * fara sa se mai traga la sorti nimic, ca toti ceilalti (si drumul mesajelor prin ei) sa ramana unde erau.
 */
export function stepAside(x, z, pad = 0.45) {
  const f = LAYOUT.foh
  const rects = [[f.x, f.z, f.w / 2 + 0.6, f.d / 2 + 0.6], ...LAYOUT.delays.map((d) => [d.x, d.z, 1.5, 1.5])]
  for (const [cx, cz, hw, hd] of rects) {
    const dx = x - cx
    const dz = z - cz
    const ex = hw + pad - Math.abs(dx)
    const ez = hd + pad - Math.abs(dz)
    if (ex <= 0 || ez <= 0) continue
    if (ex < ez) x = cx + Math.sign(dx || 1) * (hw + pad)
    else z = cz + Math.sign(dz || 1) * (hd + pad)
  }
  return [x, z]
}

/** Distanta in metri intre doua puncte ale scenei. */
export function meters(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]) * UNIT
}
