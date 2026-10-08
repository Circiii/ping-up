// Miscarea paginii, pe langa scena: butoanele mari trag usor spre cursor, bara de sus arata sectiunea in care esti,
// intrebarile se deschid pe arc, iar rider-ul, descarcarea si intrebarile intra in trepte cand ajung in ecran.
// Cu miscarea redusa modulul nici nu se incarca.
import { animate, hover, inView, stagger } from 'motion'

const SPRING = { type: 'spring', bounce: 0.18, visualDuration: 0.35 }
const SETTLE = { type: 'spring', bounce: 0.32, visualDuration: 0.5 }
const CLOSE = { type: 'spring', bounce: 0, visualDuration: 0.28 }
const OUT = [0.16, 1, 0.3, 1]

/** Butoanele mari si cel din bara de sus se apleaca spre cursor si revin pe arc cand pleaca. */
function magnetic() {
  for (const btn of document.querySelectorAll('.btn--big, .btn--small')) {
    hover(btn, () => {
      if (btn.getAttribute('aria-disabled') === 'true') return
      const follow = (e) => {
        const r = btn.getBoundingClientRect()
        animate(btn, { x: (e.clientX - r.left - r.width / 2) * 0.14, y: (e.clientY - r.top - r.height / 2) * 0.28 }, SPRING)
      }
      btn.addEventListener('pointermove', follow)
      return () => {
        btn.removeEventListener('pointermove', follow)
        animate(btn, { x: 0, y: 0 }, SETTLE)
      }
    })
  }
}

/** O pastila aluneca in bara de sus sub linkul sectiunii in care esti; harta si descarcarea nu au link. */
function navPill() {
  const box = document.querySelector('.nav__links')
  if (!box) return
  const links = [...box.querySelectorAll('a')]
  const pill = document.createElement('span')
  pill.className = 'nav__pill'
  pill.setAttribute('aria-hidden', 'true')
  box.prepend(pill)
  const owner = { cade: 0, retea: 0, mesaj: 0, raport: 0, sigilat: 1, asteapta: 1, rider: 2, intrebari: 3 }
  const order = ['acasa', 'cade', 'retea', 'mesaj', 'raport', 'sigilat', 'asteapta', 'harta', 'rider', 'descarca', 'intrebari']
    .map((id) => document.getElementById(id))
    .filter(Boolean)
  let current = -1
  let shown = false
  let queued = false
  // unde incepe fiecare sectiune, masurat doar cand se schimba asezarea: la derulare nu mai citim nimic din pagina,
  // altfel browserul ar recalcula asezarea in fiecare cadru, dupa ce povestea a schimbat textele
  let tops = []
  const measure = () => {
    tops = order.map((el) => el.getBoundingClientRect().top + scrollY)
  }
  measure()

  function update() {
    queued = false
    const mid = scrollY + innerHeight * 0.45
    let id = 'acasa'
    for (let k = 0; k < tops.length; k++) if (tops[k] <= mid) id = order[k].id
    const i = owner[id] ?? -1
    if (i === current) return
    current = i
    links.forEach((a, k) => {
      if (k === i) a.setAttribute('aria-current', 'location')
      else a.removeAttribute('aria-current')
    })
    const a = links[i]
    if (!a || !a.offsetWidth) {
      shown = false
      animate(pill, { opacity: 0 }, { duration: 0.2 })
      return
    }
    // prima data apare pe loc; de acolo aluneca de la un link la altul
    if (!shown) {
      animate(pill, { x: a.offsetLeft, width: a.offsetWidth }, { duration: 0 })
      animate(pill, { opacity: 1 }, { duration: 0.25 })
      shown = true
    } else animate(pill, { x: a.offsetLeft, width: a.offsetWidth, opacity: 1 }, SPRING)
  }
  const later = () => {
    if (queued) return
    queued = true
    requestAnimationFrame(update)
  }
  addEventListener('scroll', later, { passive: true })
  const relayout = () => {
    measure()
    current = -1
    shown = false
    later()
  }
  addEventListener('resize', relayout)
  // si cand isi schimba inaltimea pagina (fontul, scena pornita, intrebarile deschise)
  new ResizeObserver(relayout).observe(document.querySelector('main') ?? document.body)
  update()
}

/** Raspunsurile se deschid si se inchid pe arc, la fel in orice browser. */
function faq() {
  document.querySelector('.faq')?.classList.add('is-js')
  for (const d of document.querySelectorAll('.faq details')) {
    const summary = d.querySelector('summary')
    const body = summary?.nextElementSibling
    if (!body) continue
    summary.addEventListener('click', (e) => {
      e.preventDefault()
      if (d.classList.contains('is-closing')) return
      if (d.open) {
        d.classList.add('is-closing')
        animate(body, { height: [body.offsetHeight, 0], opacity: [1, 0], paddingBottom: ['24px', '0px'] }, CLOSE).then(() => {
          d.open = false
          d.classList.remove('is-closing')
          body.style.removeProperty('height')
          body.style.removeProperty('opacity')
          body.style.removeProperty('padding-bottom')
        })
      } else {
        d.open = true
        const h = body.offsetHeight
        animate(body, { height: [0, h], opacity: [0, 1], paddingBottom: ['0px', '24px'] }, SPRING).then(() => body.style.removeProperty('height'))
      }
    })
  }
}

/** Ce e mai jos in pagina intra in trepte cand ajunge in ecran; ce se vede deja ramane pe loc. */
function reveals(soft) {
  const groups = [
    ['.rider__head > *', 0.07],
    ['.spec', 0.08],
    ['.download__copy > *', 0.07],
    ['.faq h2, .faq details', 0.035],
    ['.foot > *', 0.06],
  ]
  for (const [selector, gap] of groups) {
    const items = [...document.querySelectorAll(selector)].filter((el) => el.getBoundingClientRect().top > innerHeight)
    if (!items.length) continue
    for (const el of items) {
      el.style.opacity = '0'
      el.style.transform = 'translateY(26px)'
      if (soft) el.style.filter = 'blur(6px)'
    }
    // grupul intra odata, oricare element ar ajunge primul in ecran: si urcand de jos, si dupa un salt peste titlu
    let started = false
    const stop = inView(items, () => {
      if (started) return
      started = true
      stop()
      const to = soft ? { opacity: 1, transform: 'translateY(0px)', filter: 'blur(0px)' } : { opacity: 1, transform: 'translateY(0px)' }
      animate(items, to, { duration: 0.7, ease: OUT, delay: stagger(gap) }).then(() => {
        for (const el of items) {
          el.style.removeProperty('transform')
          el.style.removeProperty('filter')
        }
      })
    }, { amount: 0.1 })
  }
}

/** Pe cardurile rider-ului o lumina moale urmareste cursorul. */
function spotlight() {
  for (const card of document.querySelectorAll('.spec')) {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect()
      card.style.setProperty('--mx', `${e.clientX - r.left}px`)
      card.style.setProperty('--my', `${e.clientY - r.top}px`)
    }, { passive: true })
  }
}

/** Codul QR se inclina spre cursor, ca un card tinut in mana. */
function tilt() {
  const qr = document.querySelector('.qr')
  if (!qr) return
  qr.addEventListener('pointermove', (e) => {
    const r = qr.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width - 0.5
    const py = (e.clientY - r.top) / r.height - 0.5
    animate(qr, { rotateY: px * 12, rotateX: -py * 12, transformPerspective: 700 }, SPRING)
  })
  qr.addEventListener('pointerleave', () => animate(qr, { rotateX: 0, rotateY: 0 }, SETTLE))
}

export function setupMotion() {
  const fine = matchMedia('(pointer: fine)').matches
  navPill()
  faq()
  // pe telefoane fara blur: e scump de desenat pe placi video mici
  reveals(fine)
  if (fine) {
    magnetic()
    spotlight()
    tilt()
  }
}
