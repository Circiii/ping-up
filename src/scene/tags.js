import * as THREE from 'three'

/** Etichete HTML lipite de puncte din scena: raman clare la orice zoom si se pot citi de ecran. */
export function createTags(layer) {
  const tags = new Map()
  const v = new THREE.Vector3()

  /** `lift` muta eticheta fata de punct, in inaltimi de eticheta: implicit deasupra, `true` pe el, alt text ca atare. */
  function add(id, html, pos, cls = '', lift = false) {
    const el = document.createElement('span')
    el.className = `tag ${cls}`.trim()
    el.innerHTML = html
    layer.appendChild(el)
    const shift = lift === true ? '-50%' : lift || '-135%'
    // numele unei zone poate sta oriunde pe ea; celelalte etichete arata un punct anume
    const flex = cls.includes('tag--zone')
    const tag = { el, pos: pos.clone(), on: false, x: -1e4, y: -1e4, lift: shift, shift: parseFloat(shift) / 100, w: 0, h: 0, flex }
    tags.set(id, tag)
    return tag
  }

  // Doua etichete care s-ar suprapune: ramane cea adaugata prima (oamenii inaintea zonelor, zonele inaintea iconitelor).
  const GAP = 3
  const placed = []
  const overlaps = (r) => placed.some((p) => r[0] < p[2] + GAP && r[2] > p[0] - GAP && r[1] < p[3] + GAP && r[3] > p[1] - GAP)

  function update(camera, width, height, visible) {
    placed.length = 0
    for (const [id, tag] of tags) {
      const want = visible.has(id)
      v.copy(tag.pos).project(camera)
      const inFront = v.z < 1 && v.z > -1
      let x = Math.round((v.x * 0.5 + 0.5) * width)
      const y = Math.round((-v.y * 0.5 + 0.5) * height)
      // numele zonei nu iese din ecran: se muta pe zona, spre interior
      if (tag.flex && tag.w) x = Math.min(width - tag.w / 2 - 6, Math.max(tag.w / 2 + 6, x))
      let on = want && inFront && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05
      let dy = 0
      if (on) {
        // marimea se citeste o singura data, nu in fiecare cadru
        if (!tag.w) {
          tag.w = tag.el.offsetWidth
          tag.h = tag.el.offsetHeight
        }
        const tries = tag.flex ? [0, tag.h + GAP, -tag.h - GAP] : [0]
        const box = (d) => {
          const top = y + d + tag.h * tag.shift
          return [x - tag.w / 2, top, x + tag.w / 2, top + tag.h]
        }
        const fit = tries.find((d) => !overlaps(box(d)))
        if (fit === undefined) on = false
        else {
          dy = fit
          placed.push(box(fit))
        }
      }
      if (on !== tag.on) {
        tag.on = on
        tag.el.classList.toggle('is-on', on)
      }
      if (!on && !want) continue
      if (x !== tag.x || y + dy !== tag.y) {
        tag.x = x
        tag.y = y + dy
        tag.el.style.transform = `translate(${x}px, ${y + dy}px) translate(-50%, ${tag.lift})`
      }
    }
  }

  return { add, update, get: (id) => tags.get(id) }
}
