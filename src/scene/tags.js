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
    const tag = { id, el, pos: pos.clone(), on: false, x: -1e4, y: -1e4, lift: shift, shift: parseFloat(shift) / 100, w: 0, h: 0, flex }
    tags.set(id, tag)
    return tag
  }

  // Doua etichete care s-ar suprapune: ramane cea adaugata prima (oamenii inaintea zonelor, zonele inaintea iconitelor).
  // Cele asezate deja in cadrul acesta stau cate patru numere (stanga, sus, dreapta, jos) intr-un singur sir, refolosit:
  // bucla ruleaza in fiecare cadru si nu lasa nimic de strans in urma.
  const GAP = 3
  const placed = []
  let count = 0
  function free(l, t, r, b) {
    for (let i = 0; i < count; i += 4) {
      if (l < placed[i + 2] + GAP && r > placed[i] - GAP && t < placed[i + 3] + GAP && b > placed[i + 1] - GAP) return false
    }
    return true
  }

  /** `top`: inaltimea barii de sus; o eticheta care ar intra pe sub ea nu se mai arata pe jumatate. */
  function update(camera, width, height, visible, top = 0) {
    count = 0
    for (const tag of tags.values()) {
      const want = visible.has(tag.id)
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
        // numele unei zone poate cobori sau urca o treapta, ca sa nu acopere alta eticheta
        const l = x - tag.w / 2
        const r = x + tag.w / 2
        on = false
        for (let k = 0; k < (tag.flex ? 3 : 1); k++) {
          const d = k === 0 ? 0 : k === 1 ? tag.h + GAP : -tag.h - GAP
          const t = y + d + tag.h * tag.shift
          if (t < top || !free(l, t, r, t + tag.h)) continue
          on = true
          dy = d
          placed[count++] = l
          placed[count++] = t
          placed[count++] = r
          placed[count++] = t + tag.h
          break
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
