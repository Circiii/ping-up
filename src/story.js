// Povestea de pe scroll: ce face camera, ce se intampla in scena si ce arata telefoanele, la fiecare pozitie.
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const smooth = (t) => t * t * t * (t * (t * 6 - 15) + 10)
const lerp = (a, b, t) => a + (b - a) * t
const linear = (u) => u
/** Fara miscare ampla: camera taie de la un cadru la altul, la jumatatea drumului. */
const cut = (u) => (u < 0.5 ? 0 : 1)

/** O valoare care se schimba pe scroll: chei la anumite pozitii, interpolate intre ele. */
class Track {
  constructor(easing = smooth) {
    this.keys = []
    this.easing = easing
  }
  key(y, v) {
    this.keys.push({ y, v })
    return this
  }
  at(y) {
    const k = this.keys
    if (y <= k[0].y) return k[0].v
    for (let i = 1; i < k.length; i++) {
      if (y <= k[i].y) {
        const a = k[i - 1]
        const b = k[i]
        const u = this.easing(clamp((y - a.y) / Math.max(1e-6, b.y - a.y)))
        if (Array.isArray(a.v)) return a.v.map((av, j) => lerp(av, b.v[j], u))
        return lerp(a.v, b.v, u)
      }
    }
    return k[k.length - 1].v
  }
}

/**
 * Un cadru al camerei, descris ca la filmare: la ce se uita, de la ce distanta, din ce parte (0 = dinspre sud,
 * grade spre est) si de cat de sus. Intre doua cadre se schimba aceste valori, deci camera ocoleste subiectul
 * in loc sa taie drept prin scena.
 */
const shot = (target, dist, az, el, fov, shift) => [...target, dist, az, el, fov, ...shift]

function place(s) {
  const a = (s[4] * Math.PI) / 180
  const e = (s[5] * Math.PI) / 180
  return [
    s[0] + Math.sin(a) * Math.cos(e) * s[3],
    s[1] + Math.sin(e) * s[3],
    s[2] + Math.cos(a) * Math.cos(e) * s[3],
    s[0], s[1], s[2], s[6], s[7], s[8],
  ]
}

const plural = (n, one, few, many) => {
  if (n === 1) return one
  const r = n % 100
  return n === 0 || (r >= 1 && r <= 19) ? few.replace('%d', n) : many.replace('%d', n)
}
export const viaPhones = (n) => (n <= 0 ? 'direct' : plural(n, 'printr-un telefon', 'prin %d telefoane', 'prin %d de telefoane'))
const linked = (n) => plural(n, 'Până aici s-a legat un telefon.', 'Până aici s-au legat %d telefoane.', 'Până aici s-au legat %d de telefoane.')
const minutesLeft = (n) => plural(n, 'mai rămâne un minut', 'mai rămân %d minute', 'mai rămân %d de minute')

/** Scrie un text doar cand s-a schimbat, ca pagina sa nu fie atinsa in fiecare cadru. */
function setText(node, value) {
  if (node.__text === value) return
  node.__text = value
  node.textContent = value
}

const CHAPTERS = ['cade', 'retea', 'mesaj', 'raport', 'sigilat', 'asteapta', 'harta']
const SECTIONS = ['acasa', ...CHAPTERS, 'rider', 'descarca', 'intrebari']
const LATER = new Set(CHAPTERS.slice(1))
/** Cat din capitol dureaza zborul camerei pana la cadrul lui si de unde incepe sa plece spre urmatorul. */
const SETTLE = 0.2
const LEAVE = 0.9

export function createStory(scene, { reduce = false } = {}) {
  const { crowd } = scene
  const s = scene.spots
  const you = [s.you.x, s.you.z]
  const times = crowd.times
  const anaHops = crowd.hops.ana
  const pathMsg = crowd.path.message
  const msgT = pathMsg.map((n) => crowd.scenarios.message.t[crowd.nodes.indexOf(n)])
  const firstHop = crowd.scenarios.report.t.reduce((m, v, i) => (i !== crowd.ids.reporter && v < m ? v : m), 1e6)
  const focusT = crowd.scenarios.report.t[crowd.nodes.indexOf(s.focus)]

  const el = (sel) => document.querySelector(sel)
  const all = (sel) => [...document.querySelectorAll(sel)]
  const nodes = Object.fromEntries(SECTIONS.map((id) => [id, el(`#${id}`)]))

  const dom = {
    sms: el('[data-phone="sms"]'),
    net: el('[data-net]'),
    netLabel: el('[data-net-label]'),
    netState: el('[data-net-state]'),
    bars: all('[data-bars]').map((b) => [...b.children]),
    carrier: el('[data-carrier]'),
    smsState: el('[data-sms-state]'),
    meshLine: el('[data-mesh-line]'),
    chat: el('[data-phone="chat"]'),
    chatSub: el('[data-chat-sub]'),
    outIcon: el('[data-out-icon]'),
    states: all('[data-states] li'),
    report: el('[data-phone="report"]'),
    steps: all('[data-steps] li'),
    stepper: all('[data-stepper] li'),
    ttl: el('[data-ttl]'),
    sealed: el('[data-sealed]'),
    carry: all('[data-carry] li'),
    carryLeft: el('[data-carry-left]'),
    rail: all('[data-rail]'),
    railBox: el('.rail'),
    railFill: el('.rail__fill'),
    bar: el('.progress i'),
    nav: el('[data-nav]'),
    root: document.documentElement,
  }

  // textele care depind de ce a iesit in simulare
  dom.states[2].lastChild.textContent = `A ajuns, ${viaPhones(anaHops - 1)}`
  dom.ttl.textContent = String(8 - scene.focusHop).padStart(2, '0')

  const icons = {
    queued: '<svg class="st" viewBox="0 0 20 20"><circle cx="10" cy="10" r="7.4"/><path d="M10 10V5.6M10 10l3.3 1.5"/></svg>',
    sent: '<svg class="st" viewBox="0 0 20 20"><circle cx="10" cy="10" r="7.4"/><path d="M6.7 10.2l2.4 2.4 4.4-4.5"/></svg>',
    delivered: '<svg class="st st--done" viewBox="0 0 29 20"><circle cx="10" cy="10" r="7.4"/><path d="M6.7 10.2l2.4 2.4 4.4-4.5"/><circle class="st__back" cx="19" cy="10" r="8.6"/><circle cx="19" cy="10" r="7.4"/><path d="M15.7 10.2l2.4 2.4 4.4-4.5"/></svg>',
  }

  let layout = null
  let tracks = null
  const timeline = { mesaj: null, raport: null }

  // aceeasi conditie ca in style.css: ecran ingust tinut in picioare, cu textul sub scena
  const upright = matchMedia('(max-width: 900px) and (max-aspect-ratio: 1/1)')
  const squat = matchMedia('(max-height: 560px) and (min-aspect-ratio: 1/1)')

  function measure() {
    const L = { vh: window.innerHeight, mobile: upright.matches, short: squat.matches, sec: {} }
    for (const id of SECTIONS) {
      const r = nodes[id].getBoundingClientRect()
      L.sec[id] = { top: r.top + window.scrollY, h: Math.max(1, r.height) }
    }
    L.storyEnd = Math.min(L.sec.rider.top, L.sec.descarca.top - L.vh)
    return L
  }

  function build() {
    layout = measure()
    const { mobile, short, sec } = layout
    const Y = (id, p) => sec[id].top + sec[id].h * p
    // pe ecrane late subiectul sta in dreapta textului; pe telefon, deasupra lui
    const sh = (dx, my, dy = 0) => (mobile ? [0, my] : [short ? Math.min(dx, -0.2) : dx, dy])
    const d = (v) => (mobile ? v * 1.42 : v)

    const pinT = [you[0], 3.7, you[1]]
    // drumul unui val trebuie sa incapa tot in cadru, oricum ar iesi simularea: camera se departeaza cat e nevoie
    const frame = (nodes, base) => {
      const xs = nodes.map((n) => n.x)
      const zs = nodes.map((n) => n.z)
      const x = (Math.min(...xs) + Math.max(...xs)) / 2
      const z = (Math.min(...zs) + Math.max(...zs)) / 2
      const r = Math.max(...nodes.map((n) => Math.hypot(n.x - x, n.z - z)))
      return { at: [x, 0, z], dist: mobile ? Math.max(base * 1.42, r * 6.4) : Math.max(base, r * 3.3) }
    }
    const msg = frame(pathMsg, 50)
    const rep = frame(crowd.path.report, 54)
    const f = [s.focus.x, s.focus.y - 0.1, s.focus.z]
    const waitA = [(s.holders[0] + s.tent.x) / 2, 1.2, (s.holders[1] + s.tent.z) / 2]
    const waitB = [s.tent.x - 4, 1.4, s.tent.z - 6]
    const wide = [0, 8, -40]

    // cate doua cadre pe capitol: unde se asaza camera si unde ajunge, incet, pana la sfarsitul lui
    const P = {
      hero: shot(pinT, mobile ? 29 : 18, -20, 12, 38, sh(-0.19, 0.27)),
      hero2: shot([pinT[0], 3.2, pinT[1]], d(24), -10, 19, 38, sh(-0.12, 0.18)),
      cade: [shot(wide, d(120), -24, 14, 40, sh(-0.12, 0.02, -0.05)), shot(wide, d(112), -15, 16, 40, sh(-0.12, 0, -0.07))],
      retea: [shot([you[0] + 2, 0, you[1] + 3], d(60), 32, 34, 40, sh(-0.08, 0.16)), shot([you[0] + 2, 0, you[1] + 3], d(66), 20, 40, 40, sh(-0.08, 0.16))],
      mesaj: [shot(msg.at, msg.dist, -20, 57, 40, sh(-0.05, 0.14)), shot(msg.at, msg.dist * 0.92, -10, 61, 40, sh(-0.05, 0.14))],
      raport: [shot(rep.at, rep.dist, 45, 53, 40, sh(-0.05, 0.13)), shot(rep.at, rep.dist * 0.92, 37, 57, 40, sh(-0.05, 0.13))],
      sigilat: [shot(f, d(7.4), 34, 17, 34, sh(0.02, -0.13)), shot(f, d(6.8), 16, 22, 34, sh(0.02, -0.13))],
      // privim dinspre nord: trecatorul pleaca de langa noi spre cortul luminat, care e deschis spre camera
      asteapta: mobile
        ? [shot(waitA, 56, -166, 30, 40, [0, 0.16]), shot(waitB, 40, -158, 26, 40, [0, 0.14])]
        : [shot(waitA, 38, -150, 25, 40, [-0.17, 0]), shot(waitB, 24, -140, 21, 40, [-0.16, 0])],
      // pe telefon harta sta in picioare, cu nordul spre dreapta, ca sa incapa toata
      harta: mobile
        ? [shot([0, 0, 0], 440, 90, 66, 40, [0, 0.13]), shot([0, 0, 0], 428, 87, 70, 40, [0, 0.13])]
        : [shot([0, 0, -2], 300, 0, 62, 40, [short ? -0.24 : -0.19, 0.1]), shot([0, 0, -2], 290, 5, 66, 40, [short ? -0.24 : -0.19, 0.1])],
      final: shot(pinT, d(22), -14, 9, 36, sh(-0.22, 0.24)),
      final2: shot(pinT, d(24), -8, 12, 36, sh(-0.22, 0.24)),
    }

    const R = sec.rider.top
    const cam = new Track(reduce ? cut : smooth)
      .key(Y('acasa', 0), P.hero)
      .key(Y('acasa', 0.45), reduce ? P.hero : P.hero2)
    for (const id of CHAPTERS) cam.key(Y(id, SETTLE), P[id][0]).key(Y(id, LEAVE), P[id][reduce ? 0 : 1])
    // cat timp foaia rider-ului acopera tot ecranul, camera se muta la cadrul de la descarcare
    cam.key(R, P.harta[reduce ? 0 : 1])
      .key(R + 1, P.final)
      .key(Y('descarca', 0), P.final)
      .key(Y('descarca', 1), reduce ? P.final : P.final2)

    const num = (pairs, easing) => {
      const t = new Track(easing)
      for (const [y, v] of pairs) t.key(y, v)
      return t
    }
    tracks = {
      cam,
      crowd: num([[Y('harta', 0.02), 1], [Y('harta', 0.2), 0.14], [R, 0.14], [R + 1, 1]]),
      dim: num([[Y('retea', 0.1), 0], [Y('retea', 0.7), 0.35], [Y('mesaj', 0.15), 0.7], [Y('asteapta', 0.92), 0.7], [Y('harta', 0.12), 0], [R + 1, 0]]),
      mesh: num([[Y('retea', 0.14), 0], [Y('retea', 0.22), 1], [Y('asteapta', 0.96), 1], [Y('harta', 0.14), 0]]),
      reveal: num([[Y('retea', 0.22), 0], [Y('retea', 0.88), 150], [Y('mesaj', 0.05), 400]], linear),
      youLinks: num([[Y('retea', 0.06), 0], [Y('retea', 0.2), 1], [Y('asteapta', 0.96), 1], [Y('harta', 0.14), 0]]),
      ping: num([[Y('acasa', 0), 1], [Y('acasa', 0.7), 0], [R, 0], [R + 1, 1]]),
      spot: num([[Y('acasa', 0.3), 1], [Y('cade', 0.16), 0.25], [Y('harta', 0.02), 0.25], [Y('harta', 0.22), 0.7], [R, 0.7], [R + 1, 1]]),
      stage: num([[Y('harta', 0.05), 1], [Y('harta', 0.22), 0.45], [R, 0.45], [R + 1, 1]]),
      tower: num([[Y('acasa', 0.6), 0], [Y('cade', 0.18), 1], [Y('cade', 0.94), 1], [Y('retea', 0.14), 0]]),
      loss: num([[Y('cade', 0.32), 0], [Y('cade', 0.84), 1]], linear),
      towerLamp: num([[Y('acasa', 0.5), 0.4], [Y('cade', 0.16), 1], [Y('retea', 0.25), 0.4]]),
      map: num([[Y('harta', 0.05), 0], [Y('harta', 0.22), 1], [R, 1], [R + 1, 0]]),
      pinScale: num([[Y('harta', 0.05), 1], [Y('harta', 0.24), 3.4], [R, 3.4], [R + 1, 1]]),
      parallax: num([[Y('acasa', 0.4), 1], [Y('cade', 0.16), 0.25], [R, 0.25], [R + 1, 1]]),
      fog: num([
        [Y('acasa', 0), 0.0085], [Y('acasa', 0.8), 0.006], [Y('cade', SETTLE), 0.0024], [Y('cade', LEAVE), 0.0024],
        [Y('retea', SETTLE), 0.0042], [Y('raport', LEAVE), 0.0045], [Y('sigilat', SETTLE), 0.0105], [Y('sigilat', LEAVE), 0.0105],
        [Y('asteapta', SETTLE), 0.0045], [Y('harta', SETTLE), 0.0016], [R, 0.0016], [R + 1, 0.0085],
      ], linear),
      led2: num([[Y('acasa', 0), 0.5], [Y('acasa', 0.6), 0.6], [Y('cade', 0.16), 1], [R, 1], [R + 1, 0.5]]),
      base: num([[Y('retea', 0.3), 0.3], [Y('mesaj', 0.1), 0.12], [Y('sigilat', 0.96), 0.12], [Y('asteapta', 0.16), 0.2]]),
      hold: num([[Y('asteapta', 0.08), 0], [Y('asteapta', 0.18), 1], [Y('asteapta', 0.8), 1], [Y('asteapta', 0.92), 0]]),
      walker: num([[Y('asteapta', 0.28), 0], [Y('asteapta', 0.92), 1]], linear),
      capsule: num([[Y('sigilat', 0.1), 0], [Y('sigilat', 0.18), 1], [Y('sigilat', 0.92), 1], [Y('sigilat', 0.98), 0]]),
    }

    // ceasul capitolelor cu valuri: cate secunde de simulare incap intr-o portiune de scroll
    const mStart = 0.4
    const bStart = mStart + times.ana + 0.7
    timeline.mesaj = { from: 0.26, to: 0.84, end: bStart + times.delivered + 0.9, a: mStart, b: bStart }
    const rStart = 0.35
    const ackStart = rStart + times.medic + 1.1
    timeline.raport = { from: 0.3, to: 0.88, end: ackStart + times.ack + 0.8, a: rStart, b: ackStart }
  }

  const progress = (id, y) => (y - layout.sec[id].top) / layout.sec[id].h

  let current = ''
  let scramble = 0
  const state = {
    cam: [0, 0, 0, 0, 0, 0, 38, 0, 0],
    chA: null, chB: null, colA: '#30D158', colB: '#D3D8B2',
    fa: -10, fb: -10, led: 'logo', tags: new Set(),
  }

  const sectionAt = (y) => {
    let id = 'acasa'
    for (const s of SECTIONS) {
      const lead = LATER.has(s) ? layout.vh * 0.05 : layout.vh * 0.5
      if (y + lead >= layout.sec[s].top) id = s
    }
    return id
  }

  // cat a parcurs cititorul din poveste, si incotro merge: bara de sus se retrage cand cobori prin poveste
  let shownProgress = -1
  let lastExact = 0
  let travel = 0
  // cu mouse-ul, bara revine si cand cursorul urca spre marginea de sus
  let nearTop = false
  if (matchMedia('(pointer: fine)').matches) addEventListener('pointermove', (e) => { nearTop = e.clientY < 90 }, { passive: true })

  /**
   * Starea povestii la derularea `y` (netezita: camera si scena o urmeaza lin) si `exact` (derularea adevarata:
   * textele, sina si bara de sus raspund pe loc, fara sa astepte camera).
   */
  function sample(y, t, exact = y) {
    if (!layout) build()
    for (const [k, tr] of Object.entries(tracks)) state[k] = tr.at(y)
    state.cam = place(state.cam)

    // Sectiunea curenta. Capitolele stau pe loc pana la capat, deci urmatorul incepe cand ajunge sus;
    // restul paginii curge, deci acolo conteaza ce a trecut de mijlocul ecranului.
    const active = sectionAt(y)
    const reading = sectionAt(exact)
    if (reading !== current) {
      current = reading
      dom.rail.forEach((a) => a.classList.toggle('is-on', a.dataset.rail === reading))
      dom.railBox.classList.toggle('is-on', CHAPTERS.includes(reading))
    }
    // textul fiecarui capitol sta pe loc cat timp camera e la cadrul lui; intra de jos si iese in sus
    CHAPTERS.forEach((id, i) => {
      const p = progress(id, exact)
      const from = i === 0 ? 0.04 : 0.08
      // ultimul capitol ramane pana il acopera foaia rider-ului
      const past = i === CHAPTERS.length - 1 ? exact >= layout.storyEnd : p >= 0.95
      nodes[id].classList.toggle('is-in', p >= from && !past)
      nodes[id].classList.toggle('is-past', past)
    })
    const inStory = exact > layout.sec.cade.top - layout.vh * 0.35 && exact < layout.sec.rider.top
    dom.root.classList.toggle('in-story', inStory)
    dom.nav.classList.toggle('is-solid', exact > 40)

    // cat din poveste s-a citit: linia din sina si bara subtire de pe telefon; scriem doar cand se schimba vizibil
    const story = Math.min(1, Math.max(0, (exact - layout.sec.cade.top) / (layout.storyEnd - layout.sec.cade.top)))
    if (Math.abs(story - shownProgress) > 0.001) {
      shownProgress = story
      const k = `scaleY(${story.toFixed(4)})`
      if (dom.railFill) dom.railFill.style.transform = k
      if (dom.bar) dom.bar.style.transform = `scaleX(${story.toFixed(4)})`
    }
    // bara de sus: cobori prin poveste, se retrage; urci putin, revine. Intre ele, un prag, ca sa nu clipeasca.
    const dy = exact - lastExact
    lastExact = exact
    // cadrele in care pagina sta pe loc nu sterg drumul strans: derularea lenta sau in pasi il aduna si ea
    if (dy) {
      if (Math.sign(dy) !== Math.sign(travel)) travel = 0
      travel += dy
    }
    const tuck = inStory && !nearTop && !dom.nav.classList.contains('is-open') && !dom.nav.contains(document.activeElement)
    if (!tuck || travel < -40) dom.nav.classList.remove('is-tucked')
    else if (travel > 120) dom.nav.classList.add('is-tucked')

    state.chA = null
    state.chB = null
    state.fa = -10
    state.fb = -10
    state.led = 'logo'
    const tags = state.tags
    tags.clear()

    if (active === 'cade') {
      const loss = state.loss
      tags.add('tower')
      state.led = loss > 0.55 ? 'nosignal' : 'logo'
      const off = Math.round(loss * 4.4)
      for (const bars of dom.bars) bars.forEach((b, i) => b.classList.toggle('is-off', i >= 4 - off))
      const dead = loss >= 0.86
      const carrier = loss > 0.5 ? 'E' : '4G'
      dom.sms.classList.toggle('is-dead', dead)
      dom.net.classList.toggle('is-dead', dead)
      setText(dom.carrier, dead ? '' : carrier)
      setText(dom.smsState, dead ? 'Netrimis. Atinge ca să încerci din nou.' : 'Se trimite…')
      // pe telefon nu incape macheta; aceeasi stare apare intr-un rand sub text
      setText(dom.netLabel, dead ? 'Fără semnal' : carrier)
      setText(dom.netState, dead ? 'SMS-ul către Ana nu a plecat' : 'SMS-ul către Ana se trimite…')
    }

    if (active === 'retea') {
      tags.add('you')
      state.led = 'mesh'
      setText(dom.meshLine, linked(scene.meshCount(state.reveal)))
    }

    if (active === 'mesaj') {
      const tl = timeline.mesaj
      const p = progress('mesaj', y)
      const T = clamp((p - tl.from) / (tl.to - tl.from)) * tl.end
      state.chA = 'message'
      state.chB = 'delivered'
      state.colA = '#30D158'
      state.colB = '#D3D8B2'
      state.fa = T - tl.a
      state.fb = T - tl.b
      tags.add('you').add('ana')
      pathMsg.slice(1, -1).forEach((_, i) => { if (state.fa >= msgT[i + 1]) tags.add(`hop${i + 1}`) })
      let st = 0
      if (p > 0.16) st = 1
      if (state.fa > 0.12) st = 2
      if (state.fb >= times.delivered) st = 3
      if (p > 0.87) st = 4
      if (p > 0.91) st = 5
      if (setPhone(dom.chat, st, 5)) {
        dom.outIcon.innerHTML = st >= 3 ? icons.delivered : st >= 2 ? icons.sent : icons.queued
        setText(dom.chatSub, st >= 3 ? `În apropiere · ${viaPhones(anaHops - 1)}` : 'Văzut acum 6 min')
        dom.states.forEach((li, i) => {
          li.classList.toggle('is-now', (st === 1 && i === 0) || (st === 2 && i === 1) || (st >= 3 && i === 2))
          li.classList.toggle('is-on', st > 0 && i <= Math.min(2, st - 1))
        })
      }
    }

    if (active === 'raport') {
      const tl = timeline.raport
      const p = progress('raport', y)
      const T = clamp((p - tl.from) / (tl.to - tl.from)) * tl.end
      state.chA = 'report'
      state.chB = 'ack'
      state.colA = '#FF9F0A'
      state.colB = '#30D158'
      state.fa = T - tl.a
      state.fb = T - tl.b
      tags.add('reporter').add('medic')
      let st = 0
      if (p > 0.15) st = 1
      if (p > 0.24) st = 2
      if (state.fa > firstHop) st = 3
      if (state.fa >= times.medic) st = 4
      if (state.fb >= times.ack) st = 5
      if (p > 0.92) st = 6
      if (setPhone(dom.report, st, 6)) {
        const step = st - 2
        for (const list of [dom.steps, dom.stepper]) {
          list.forEach((li, i) => {
            li.classList.toggle('is-on', st >= 2 && i <= step)
            li.classList.toggle('is-now', st >= 2 && i === step && i < 4)
          })
        }
      }
    }

    if (active === 'sigilat') {
      const p = progress('sigilat', y)
      state.chA = 'report'
      state.colA = '#FF9F0A'
      state.fa = focusT + (p - 0.55) * 3.4
      tags.add('focus')
      if (t - scramble > 0.09 || scramble > t) {
        scramble = t
        dom.sealed.textContent = sealedBytes(198)
      }
    }

    if (active === 'asteapta') {
      const p = progress('asteapta', y)
      tags.add('tent')
      if (state.hold > 0.3) tags.add('holders')
      const w = state.walker
      const step = w > 0.86 ? 2 : w > 0.04 ? 1 : p > 0.14 ? 0 : -1
      dom.carry.forEach((li, i) => {
        li.classList.toggle('is-on', i <= step)
        li.classList.toggle('is-now', i === step && i < 2)
      })
      setText(dom.carryLeft, minutesLeft(30 - Math.floor(clamp((p - 0.14) / 0.8) * 4)))
    }

    if (active === 'harta') {
      tags.add('you').add('ana').add('meeting')
      for (const id of ['main-stage', 'second-stage', 'food', 'bar', 'medical', 'entrance', 'camping', 'chill']) tags.add(`zone-${id}`)
      for (let i = 0; i < scene.poiCount; i++) tags.add(`poi-${i}`)
    }

    return state
  }

  /** Schimba starea unui telefon; intoarce true doar cand chiar s-a schimbat. */
  function setPhone(phone, st, max) {
    if (phone.dataset.st === String(st)) return false
    phone.dataset.st = String(st)
    for (let i = 0; i <= max; i++) phone.classList.toggle(`s-${i}`, i === st)
    return true
  }

  /** Sub sectiunile opace nu mai desenam nimic. */
  function sceneVisible(y) {
    if (!layout) return true
    const { rider, descarca, intrebari } = layout.sec
    return y < rider.top || (y + layout.vh > descarca.top && y < intrebari.top)
  }

  /** Unde aterizeaza un link catre o sectiune: la capitole, in punctul in care camera s-a asezat. */
  function landing(id) {
    if (!layout) build()
    const sc = layout.sec[id]
    if (!sc) return null
    const y = CHAPTERS.includes(id) ? sc.top + sc.h * (SETTLE + 0.04) : sc.top
    return Math.round(Math.min(y, document.documentElement.scrollHeight - layout.vh))
  }

  return {
    sample,
    rebuild: build,
    sceneVisible,
    landing,
    get layout() { return layout },
  }
}

const HEX = '0123456789abcdef'
function sealedBytes(n) {
  let out = ''
  for (let i = 0; i < n; i++) {
    out += HEX[(Math.random() * 16) | 0] + HEX[(Math.random() * 16) | 0] + (i < n - 1 ? ' ' : '')
  }
  return out
}
