// Oamenii din multime, din people.dat (vezi scripts/people.mjs): personaje CC0 de la Quaternius, in pozele de la
// concert, pe trei trepte de detaliu. Fisierul vine comprimat; il desface browserul, fara biblioteci in plus.
import * as THREE from 'three'

const linear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))

/** Fisierul vine comprimat cu gzip; il desface browserul (sau Node, in teste). */
export async function unpack(buf) {
  const head = new Uint8Array(buf, 0, 2)
  if (head[0] !== 0x1f || head[1] !== 0x8b) return buf
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).arrayBuffer()
}

/** Desface fisierul: pentru fiecare personaj, pe fiecare treapta, cate o geometrie pentru fiecare poza. */
export function parsePeople(buf) {
  const dv = new DataView(buf)
  if (String.fromCharCode(...new Uint8Array(buf, 0, 4)) !== 'PPL2') throw new Error('people.dat: alt format')
  const headLen = dv.getUint32(4, true)
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, headLen)))
  const base = 8 + headLen
  const [lo, hi] = header.box
  const u16 = (at, n) => new Uint16Array(buf, base + at, n)

  const chars = header.chars.map((c) => {
    // culorile paletei, din sRGB in lumina liniara, cu rolul alaturi
    const pal = c.palette.map(([r, g, b, role]) => [linear(r / 255), linear(g / 255), linear(b / 255), role])
    const lods = c.lods.map((l) => {
      const n = l.count
      // indicii si pozitiile sunt scrise ca diferente fata de precedentul
      const d = u16(l.idx, l.tris * 3)
      const index = new Uint16Array(d.length)
      let prev = 0
      for (let i = 0; i < d.length; i++) index[i] = prev = (prev + d[i]) & 0xffff
      const indexAttr = new THREE.BufferAttribute(index, 1)

      const col = new Uint8Array(buf, base + l.col, n)
      const scr = new Int8Array(buf, base + l.scr, (n - l.phone) * 2)
      const color = new Float32Array(n * 3)
      const role = new Float32Array(n)
      const screen = new Float32Array(n * 2)
      for (let i = 0; i < n; i++) {
        const k = col[i]
        // telefonul nu sta in paleta: 255 - rol
        if (k > 200) {
          role[i] = 255 - k
          color.set([0.0006, 0.0006, 0.0007], i * 3)
        } else {
          color.set(pal[k].slice(0, 3), i * 3)
          role[i] = pal[k][3]
        }
        if (i >= l.phone) screen.set([scr[(i - l.phone) * 2] / 127, scr[(i - l.phone) * 2 + 1] / 127], i * 2)
      }
      const colorAttr = new THREE.BufferAttribute(color, 3)
      const roleAttr = new THREE.BufferAttribute(role, 1)
      const screenAttr = new THREE.BufferAttribute(screen, 2)

      const poses = {}
      for (const p of l.poses) {
        const q = u16(p.pos, n * 3)
        const pos = new Float32Array(n * 3)
        for (let k = 0; k < 3; k++) {
          let acc = 0
          const scale = (hi[k] - lo[k]) / 65535
          for (let i = 0; i < n; i++) {
            acc = (acc + q[k * n + i]) & 0xffff
            pos[i * 3 + k] = lo[k] + acc * scale
          }
        }
        const o = new Int8Array(buf, base + p.nrm, n * 2)
        const nrm = new Float32Array(n * 3)
        for (let i = 0; i < n; i++) {
          let x = o[i * 2] / 127
          let y = o[i * 2 + 1] / 127
          const z = 1 - Math.abs(x) - Math.abs(y)
          if (z < 0) {
            const px = (1 - Math.abs(y)) * (x >= 0 ? 1 : -1)
            y = (1 - Math.abs(x)) * (y >= 0 ? 1 : -1)
            x = px
          }
          const len = Math.hypot(x, y, z) || 1
          nrm.set([x / len, y / len, z / len], i * 3)
        }
        const g = new THREE.BufferGeometry()
        g.setIndex(indexAttr)
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
        g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3))
        g.setAttribute('aColor', colorAttr)
        g.setAttribute('aRole', roleAttr)
        g.setAttribute('aScreen', screenAttr)
        poses[p.name] = { geometry: g, height: p.height }
      }
      return { poses, bodyIndexCount: l.body }
    })
    return { id: c.id, poses: c.poses, lods }
  })
  return { chars, credits: header.credits }
}

/** Oamenii, gata de pus in scena; respinge daca fisierul nu vine sau browserul nu il poate desface. */
export async function loadPeople(url) {
  if (typeof DecompressionStream === 'undefined') throw new Error('fara DecompressionStream')
  const res = await fetch(url)
  if (!res.ok) throw new Error(`people.dat: ${res.status}`)
  return parsePeople(await unpack(await res.arrayBuffer()))
}
