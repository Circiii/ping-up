import { meters } from './scene/world.js'

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const smooth = (t) => t * t * t * (t * (t * 6 - 15) + 10)
const lerp = (a, b, t) => a + (b - a) * t

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

/** Pozitia camerei in jurul unui punct: distanta, unghiul de la sud spre est, inaltimea in grade. */
function orbit(t, dist, az, el, fov, shift) {
  const a = (az * Math.PI) / 180
  const e = (el * Math.PI) / 180
  return [
    t[0] + Math.sin(a) * Math.cos(e) * dist,
    t[1] + Math.sin(e) * dist,
    t[2] + Math.cos(a) * Math.cos(e) * dist,
    t[0], t[1], t[2], fov, shift[0], shift[1],
  ]
}

const plural = (n, one, few, many) => {
  if (n === 1) return one
  const r = n % 100
  return n === 0 || (r >= 1 && r <= 19) ? few.replace('%d', n) : many.replace('%d', n)
}
export const viaPhones = (n) => (n <= 0 ? 'direct' : plural(n, 'printr-un telefon', 'prin %d telefoane', 'prin %d de telefoane'))
export const connectedTo = (n) => plural(n, 'Conectat la un telefon', 'Conectat la %d telefoane', 'Conectat la %d de telefoane')
const minutesLeft = (n) => plural(n, 'mai rămâne un minut', 'mai rămân %d minute', 'mai rămân %d de minute')
const thousands = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

const NONE = new Set()

export function createStory(scene) {
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
  const sections = ['acasa', 'cade', 'retea', 'mesaj', 'raport', 'sigilat', 'asteapta', 'harta', 'rider', 'descarca', 'intrebari']
  const nodes = Object.fromEntries(sections.map((id) => [id, el(`#${id}`)]))

  const dom = {
    netchip: el('[data-netchip]'),
    netchipText: el('[data-netchip-text]'),
    signal: el('.signal'),
    bars: [...document.querySelectorAll('.bars i')],
    carrier: el('[data-carrier]'),
    signalState: el('[data-signal-state]'),
    meshCount: el('[data-mesh-count]'),
    meshLinks: el('[data-mesh-links]'),
    chat: el('[data-phone="chat"]'),
    chatSub: el('[data-chat-sub]'),
    outIcon: el('[data-out-icon]'),
    states: [...document.querySelectorAll('[data-states] li')],
    report: el('[data-phone="report"]'),
    steps: [...document.querySelectorAll('[data-steps] li')],
    stepper: [...document.querySelectorAll('[data-stepper] li')],
    ttl: el('[data-ttl]'),
    sealed: el('[data-sealed]'),
    carry: [...document.querySelectorAll('[data-carry]')],
    carryLeft: el('[data-carry-left]'),
    meet: el('[data-meet-distance]'),
    rail: [...document.querySelectorAll('[data-rail]')],
    railBox: el('.rail'),
    nav: el('[data-nav]'),
  }

  // textele care depind de ce a iesit in simulare
  dom.states[2].lastChild.textContent = `A ajuns, ${viaPhones(anaHops - 1)}`
  dom.meshLinks.textContent = connectedTo(crowd.youLinks)
  dom.ttl.textContent = String(8 - scene.focusHop).padStart(2, '0')
  dom.meet.textContent = `la ${Math.round(meters(you, s.meeting) / 10) * 10} m de tine`

  const icons = {
    queued: '<svg class="st" viewBox="0 0 20 20"><circle cx="10" cy="10" r="7.4"/><path d="M10 10V5.6M10 10l3.3 1.5"/></svg>',
    sent: '<svg class="st" viewBox="0 0 20 20"><circle cx="10" cy="10" r="7.4"/><path d="M6.7 10.2l2.4 2.4 4.4-4.5"/></svg>',
    delivered: '<svg class="st st--done" viewBox="0 0 29 20"><circle cx="10" cy="10" r="7.4"/><path d="M6.7 10.2l2.4 2.4 4.4-4.5"/><circle class="st__back" cx="19" cy="10" r="8.6"/><circle cx="19" cy="10" r="7.4"/><path d="M15.7 10.2l2.4 2.4 4.4-4.5"/></svg>',
  }

  let layout = null
  let tracks = null
  const timeline = { mesaj: null, raport: null }

  function measure() {
    const vh = window.innerHeight
    const scrollY = window.scrollY
    const L = { vh, mobile: window.innerWidth < 900, sec: {} }
    for (const id of sections) {
      const r = nodes[id].getBoundingClientRect()
      const top = r.top + scrollY
      // capitolele au scena lipita sus, deci se misca pe inaltime minus un ecran; restul, pe toata inaltimea
      const sticky = nodes[id].classList.contains('chapter')
      L.sec[id] = { top, h: r.height, span: Math.max(1, sticky ? r.height - vh : r.height) }
    }
    return L
  }

  function build() {
    layout = measure()
    const { mobile, sec } = layout
    const Y = (id, p) => sec[id].top + sec[id].span * p
    const sh = (dx, my, dy = 0) => (mobile ? [0, my] : [dx, dy])
    const d = (v) => (mobile ? v * 1.42 : v)

    const pinT = [you[0], 3.7, you[1]]
    const midMsg = [(you[0] + s.ana.x) / 2, 0, (you[1] + s.ana.z) / 2]
    const midRep = [(s.reporter.x + s.medic.x) / 2, 0, (s.reporter.z + s.medic.z) / 2]
    const f = [s.focus.x, s.focus.y + 0.15, s.focus.z]
    const waitT = [(s.holders[0] + s.tent.x) / 2 + 2, 0, (s.holders[1] + s.tent.z) / 2]

    const P = {
      hero: orbit(pinT, mobile ? 29 : 18, -20, 12, 38, sh(-0.19, 0.27)),
      hero2: orbit([pinT[0], 3.2, pinT[1]], d(24), -10, 19, 38, sh(-0.12, 0.18)),
      cade: orbit(mobile ? [72, 8, -72] : [38, 6, -44], d(190), -24, 29, 40, sh(-0.12, 0.12)),
      cade2: orbit(mobile ? [72, 8, -72] : [38, 6, -44], d(178), -14, 32, 40, sh(-0.12, 0.12)),
      retea: orbit([you[0] + 2, 0, you[1] + 3], d(60), 32, 34, 40, sh(-0.08, 0.16)),
      retea2: orbit([you[0] + 2, 0, you[1] + 3], d(66), 20, 40, 40, sh(-0.08, 0.16)),
      mesaj: orbit(midMsg, d(50), -20, 57, 40, sh(-0.05, 0.22)),
      mesaj2: orbit(midMsg, d(46), -10, 61, 40, sh(-0.05, 0.22)),
      raport: orbit(midRep, d(54), 45, 53, 40, sh(-0.05, 0.22)),
      raport2: orbit(midRep, d(50), 37, 57, 40, sh(-0.05, 0.22)),
      sigilat: orbit(f, d(7.6), 30, 16, 34, sh(0, 0.12)),
      sigilat2: orbit(f, d(7), 12, 21, 34, sh(0, 0.12)),
      asteapta: orbit(waitT, d(58), -34, 52, 40, sh(-0.08, 0.2)),
      asteapta2: orbit(waitT, d(54), -24, 57, 40, sh(-0.08, 0.2)),
      harta: orbit([4, 0, -2], d(262), 0, 62, 40, sh(-0.21, 0.04, 0.12)),
      harta2: orbit([4, 0, -2], d(252), 5, 66, 40, sh(-0.21, 0.04, 0.12)),
      final: orbit(pinT, d(22), -34, 7, 36, sh(-0.22, 0.24)),
      final2: orbit(pinT, d(24), -26, 11, 36, sh(-0.22, 0.24)),
    }

    const cam = new Track()
      .key(Y('acasa', 0), P.hero)
      .key(Y('acasa', 0.45), P.hero2)
    const scenes = [['cade', P.cade, P.cade2], ['retea', P.retea, P.retea2], ['mesaj', P.mesaj, P.mesaj2], ['raport', P.raport, P.raport2], ['sigilat', P.sigilat, P.sigilat2], ['asteapta', P.asteapta, P.asteapta2], ['harta', P.harta, P.harta2]]
    for (const [id, a, b] of scenes) cam.key(Y(id, 0.12), a).key(Y(id, 0.9), b)
    cam.key(sec.rider.top + layout.vh * 0.9, P.harta2)
      .key(sec.rider.top + layout.vh * 1.0, P.final)
      .key(Y('descarca', 0.0), P.final)
      .key(Y('descarca', 1), P.final2)

    const num = (pairs, easing) => {
      const t = new Track(easing)
      for (const [y, v] of pairs) t.key(y, v)
      return t
    }
    const linear = (u) => u
    const R = sec.rider.top
    tracks = {
      cam,
      crowd: num([[Y('acasa', 0), 1], [Y('harta', 0), 1], [Y('harta', 0.15), 0.14], [R, 0.14], [R + 1, 1]]),
      dim: num([[Y('retea', 0), 0], [Y('retea', 0.6), 0.35], [Y('mesaj', 0.1), 0.7], [Y('asteapta', 0.9), 0.7], [Y('harta', 0.1), 0], [R + 1, 0]]),
      mesh: num([[Y('retea', 0.05), 0], [Y('retea', 0.12), 1], [Y('asteapta', 0.95), 1], [Y('harta', 0.12), 0]]),
      reveal: num([[Y('retea', 0.12), 0], [Y('retea', 0.8), 150], [Y('mesaj', 0), 400]], linear),
      youLinks: num([[Y('retea', 0), 0], [Y('retea', 0.1), 1]]),
      ping: num([[Y('acasa', 0), 1], [Y('acasa', 0.7), 0], [R, 0], [R + 1, 1]]),
      spot: num([[Y('acasa', 0.3), 1], [Y('cade', 0.1), 0.25], [Y('harta', 0), 0.25], [Y('harta', 0.2), 0.7], [R, 0.7], [R + 1, 1]]),
      stage: num([[Y('cade', 0), 1], [Y('harta', 0.05), 1], [Y('harta', 0.2), 0.45], [R, 0.45], [R + 1, 1]]),
      tower: num([[Y('acasa', 0.6), 0], [Y('cade', 0.12), 1], [Y('cade', 0.92), 1], [Y('retea', 0.1), 0]]),
      loss: num([[Y('cade', 0.22), 0], [Y('cade', 0.84), 1]], linear),
      towerLamp: num([[Y('acasa', 0.5), 0.4], [Y('cade', 0.1), 1], [Y('retea', 0.2), 0.4]]),
      map: num([[Y('harta', 0.02), 0], [Y('harta', 0.2), 1], [R, 1], [R + 1, 0]]),
      pinScale: num([[Y('harta', 0.02), 1], [Y('harta', 0.22), 3.4], [R, 3.4], [R + 1, 1]]),
      parallax: num([[Y('acasa', 0.4), 1], [Y('cade', 0.1), 0.25], [R, 0.25], [R + 1, 1]]),
      fog: num([[Y('acasa', 0), 0.0085], [Y('acasa', 0.8), 0.006], [Y('cade', 0.12), 0.0024], [Y('cade', 0.9), 0.0024], [Y('retea', 0.12), 0.0042], [Y('sigilat', 0), 0.0045], [Y('sigilat', 0.12), 0.011], [Y('sigilat', 0.9), 0.011], [Y('asteapta', 0.12), 0.0045], [Y('harta', 0.12), 0.0016], [R, 0.0016], [R + 1, 0.0085]], linear),
      led2: num([[Y('acasa', 0), 0.16], [Y('acasa', 0.6), 0.3], [Y('cade', 0.1), 1], [R, 1], [R + 1, 0.16]]),
      base: num([[Y('retea', 0), 0.3], [Y('mesaj', 0.05), 0.12], [Y('sigilat', 0.95), 0.12], [Y('asteapta', 0.1), 0.2]]),
      hold: num([[Y('asteapta', 0), 0], [Y('asteapta', 0.08), 1], [Y('asteapta', 0.78), 1], [Y('asteapta', 0.92), 0]]),
      walker: num([[Y('asteapta', 0.18), 0], [Y('asteapta', 0.92), 1]], linear),
      capsule: num([[Y('sigilat', 0.04), 0], [Y('sigilat', 0.12), 1], [Y('sigilat', 0.9), 1], [Y('sigilat', 0.98), 0]]),
    }

    // ceasul fiecarui capitol cu valuri: secunde de simulare pe o portiune din scroll
    const mStart = 0.4
    const bStart = mStart + times.ana + 0.7
    const mEnd = bStart + times.delivered + 0.9
    timeline.mesaj = { from: 0.14, to: 0.86, end: mEnd, a: mStart, b: bStart }
    const rStart = 0.35
    const ackStart = rStart + times.medic + 1.1
    const rEnd = ackStart + times.ack + 0.8
    timeline.raport = { from: 0.18, to: 0.9, end: rEnd, a: rStart, b: ackStart }
  }

  function progress(id, y) {
    const sc = layout.sec[id]
    return (y - sc.top) / sc.span
  }

  let current = ''
  let scramble = 0
  const state = {
    cam: [0, 0, 0, 0, 0, 0, 38, 0, 0],
    chA: null, chB: null, colA: '#30D158', colB: '#D3D8B2',
    fa: -10, fb: -10, led: 'logo', tags: NONE,
  }

  function sample(y, t) {
    if (!layout) build()
    for (const [k, tr] of Object.entries(tracks)) state[k] = tr.at(y)

    // capitolul care ocupa mijlocul ecranului
    const mid = y + layout.vh * 0.5
    let active = 'acasa'
    for (const id of sections) if (mid >= layout.sec[id].top) active = id
    if (active !== current) {
      current = active
      dom.rail.forEach((a) => a.classList.toggle('is-on', a.dataset.rail === active))
      dom.railBox.classList.toggle('is-on', ['cade', 'retea', 'mesaj', 'raport', 'sigilat', 'asteapta', 'harta'].includes(active))
    }
    for (const id of ['cade', 'retea', 'mesaj', 'raport', 'sigilat', 'asteapta', 'harta']) {
      const p = progress(id, y)
      nodes[id].classList.toggle('is-in', p > -0.6 && p < 1.15)
    }
    dom.nav.classList.toggle('is-solid', y > 40)

    state.chA = null
    state.chB = null
    state.fa = -10
    state.fb = -10
    state.led = 'logo'
    const tags = new Set()

    if (active === 'acasa') {
      const linked = t > 1.6
      dom.netchip.classList.toggle('is-linked', linked)
      dom.netchipText.textContent = linked ? connectedTo(crowd.youLinks) : 'Caut telefoane în apropiere'
    }

    if (active === 'cade') {
      const loss = state.loss
      tags.add('tower')
      state.led = loss > 0.55 ? 'nosignal' : 'logo'
      const off = Math.round(loss * 4.4)
      dom.bars.forEach((b, i) => b.classList.toggle('is-off', i >= 4 - off))
      const dead = loss >= 0.86
      dom.signal.classList.toggle('is-dead', dead)
      dom.carrier.textContent = dead ? 'SOS' : loss > 0.5 ? 'E' : '4G'
      dom.signalState.textContent = dead ? 'Fără serviciu' : loss > 0.4 ? 'Se trimite…' : 'Semnal slab'
    }

    if (active === 'retea') {
      tags.add('you')
      state.led = 'mesh'
      dom.meshCount.textContent = thousands(scene.meshCount(state.reveal))
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
      if (p > 0.06) st = 1
      if (state.fa > 0.12) st = 2
      if (state.fb >= times.delivered) st = 3
      if (p > 0.9) st = 4
      if (p > 0.95) st = 5
      setPhone(dom.chat, st, 5)
      dom.outIcon.innerHTML = st >= 3 ? icons.delivered : st >= 2 ? icons.sent : icons.queued
      dom.chatSub.textContent = st >= 3 ? `În apropiere · ${viaPhones(anaHops - 1)}` : 'Văzut acum 6 min'
      dom.states.forEach((li, i) => {
        const now = (st === 1 && i === 0) || (st === 2 && i === 1) || (st >= 3 && i === 2)
        li.classList.toggle('is-now', now)
        li.classList.toggle('is-on', i <= Math.min(2, st - 1) && st > 0)
      })
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
      if (p > 0.07) st = 1
      if (p > 0.15) st = 2
      if (state.fa > firstHop) st = 3
      if (state.fa >= times.medic) st = 4
      if (state.fb >= times.ack) st = 5
      if (p > 0.95) st = 6
      setPhone(dom.report, st, 6)
      const step = st - 2
      ;[dom.steps, dom.stepper].forEach((list) => list.forEach((li, i) => {
        li.classList.toggle('is-on', st >= 2 && i <= step)
        li.classList.toggle('is-now', st >= 2 && i === step && i < 4)
      }))
    }

    if (active === 'sigilat') {
      const p = progress('sigilat', y)
      state.chA = 'report'
      state.colA = '#FF9F0A'
      state.fa = focusT + (p - 0.5) * 3.4
      tags.add('focus')
      if (t - scramble > 0.09) {
        scramble = t
        dom.sealed.textContent = sealedBytes(198)
      }
    }

    if (active === 'asteapta') {
      const p = progress('asteapta', y)
      tags.add('tent')
      if (state.hold > 0.3) tags.add('holders')
      const w = state.walker
      dom.carry[0].classList.toggle('is-on', p > 0.02)
      dom.carry[1].classList.toggle('is-on', w > 0.05)
      dom.carry[2].classList.toggle('is-on', w > 0.86)
      dom.carryLeft.textContent = minutesLeft(30 - Math.floor(clamp(p) * 4))
    }

    if (active === 'harta') {
      tags.add('you').add('ana').add('meeting')
      for (const id of ['main-stage', 'second-stage', 'food', 'bar', 'medical', 'entrance', 'camping', 'chill']) tags.add(`zone-${id}`)
      for (let i = 0; i < scene.poiCount; i++) tags.add(`poi-${i}`)
    }

    state.tags = tags
    return state
  }

  function setPhone(phone, st, max) {
    if (phone.dataset.st === String(st)) return
    phone.dataset.st = String(st)
    for (let i = 0; i <= max; i++) phone.classList.toggle(`s-${i}`, i === st)
  }

  /** Cat din fereastra acopera canvasul: sub sectiunile opace nu mai desenam nimic. */
  function sceneVisible(y) {
    if (!layout) return true
    const vh = layout.vh
    const { rider, descarca, intrebari } = layout.sec
    const top = y
    const bottom = y + vh
    const open1 = top < rider.top
    const open2 = bottom > descarca.top && top < intrebari.top
    return open1 || open2
  }

  return {
    sample,
    rebuild: build,
    sceneVisible,
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
