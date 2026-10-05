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
    const tag = { el, pos: pos.clone(), on: false, x: -1e4, y: -1e4, lift: lift === true ? '-50%' : lift || '-135%' }
    tags.set(id, tag)
    return tag
  }

  function update(camera, width, height, visible) {
    for (const [id, tag] of tags) {
      const want = visible.has(id)
      v.copy(tag.pos).project(camera)
      const inFront = v.z < 1 && v.z > -1
      const on = want && inFront && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05
      if (on !== tag.on) {
        tag.on = on
        tag.el.classList.toggle('is-on', on)
      }
      if (!on && !want) continue
      const x = Math.round((v.x * 0.5 + 0.5) * width)
      const y = Math.round((-v.y * 0.5 + 0.5) * height)
      if (x !== tag.x || y !== tag.y) {
        tag.x = x
        tag.y = y
        tag.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, ${tag.lift})`
      }
    }
  }

  return { add, update, get: (id) => tags.get(id) }
}
