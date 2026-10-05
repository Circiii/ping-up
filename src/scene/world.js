// Festivalul din scena e harta din aplicatie (venue.json, copiat din proiectul Android), adusa la scara scenei.
import venue from '../data/venue.json'

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

export function zoneAt(x, z) {
  return zones.find((zn) => inside(zn.pts, x, z)) ?? null
}

const ms = zone['main-stage']
const s2 = zone['second-stage']

/** Scena mare sta la marginea de nord a zonei ei, cu fata spre multime. */
export const STAGE = { x: 0, front: ms.z0 + 0.4, back: ms.z0 - 7.6, half: 16, barrier: ms.z0 + 2.4 }
/** Scena 2 sta la marginea de est a zonei ei, cu fata spre vest. */
export const STAGE2 = { x: s2.x1 - 3, z: (s2.z0 + s2.z1) / 2 + 2, half: 7 }

/** Locurile povestii: tu (pinul), Ana, cel care raporteaza, echipa medicala. */
export const SPOTS = {
  you: [-9, -21],
  ana: [-15, -5],
  reporter: [9, ms.z0 + 6],
  medic: [33, ms.z0 + 30],
  tent: [(zone.medical.x0 + zone.medical.x1) / 2, (zone.medical.z0 + zone.medical.z1) / 2 + 1],
  meeting,
}

/** Distanta in metri intre doua puncte ale scenei. */
export function meters(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]) * UNIT
}
