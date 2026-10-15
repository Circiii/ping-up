import './style.css'
import peopleUrl from './scene/people.dat?url'
import atlasUrl from './scene/people.webp?url'
import { setupDownload } from './ui/download.js'
import { setupMenu } from './ui/menu.js'

setupDownload()
setupMenu()

const canvas = document.getElementById('scene')
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches

// miscarea interfetei (butoane, bara de sus, intrebari, intrari in pagina) vine separat, dupa scena
if (!reduce) import('./ui/motion.js').then((m) => m.setupMotion(), () => {})

/** Numele placii video, daca browserul il spune; null fara WebGL 2. */
function gpu() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2')
    if (!gl) return null
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const name = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return String(name || '')
  } catch {
    return null
  }
}
const GPU = gpu()

// Placile video slabe ale telefoanelor ieftine (Mali-G31/G5x, Adreno 5xx-61x, PowerVR) si cele integrate vechi ale
// laptopurilor (Intel HD/UHD, fara Iris): pe ele scena porneste direct cu mai putini pixeli
const WEAK_PHONE = /Mali-(4|T|G31|G5[0-9])|Adreno \(TM\) ([1-5]\d\d|6[01]\d)\b|PowerVR/i
const OLD_LAPTOP = /Intel.*(HD|UHD) Graphics(?!.*Iris)/i

/**
 * Telefoanele si laptopurile modeste primesc mai putina lume, o rezolutie mai mica si scena fara stralucire. Pe
 * ecranele dense rezolutia scenei se opreste la 1,5: imaginea e netezita oricum, iar pixelii in plus costau aproape
 * un sfert din cadru fara sa se vada.
 */
function quality() {
  const coarse = matchMedia('(pointer: coarse)').matches
  const narrow = Math.min(screen.width, screen.height) < 760
  const cores = navigator.hardwareConcurrency || 4
  const memory = navigator.deviceMemory || 4
  const weak = WEAK_PHONE.test(GPU) || OLD_LAPTOP.test(GPU)
  const low = (coarse && narrow) || cores <= 4 || memory <= 3 || weak
  const cap = weak ? 1 : 1.5
  return { low, dpr: Math.min(devicePixelRatio || 1, cap), density: weak ? 0.35 : low ? 0.45 : 1 }
}

async function start() {
  // scena se descarca in timp ce asteptam putin fontul: ecranele LED scriu cu Inter
  const parts = Promise.all([import('./scene/index.js'), import('./story.js'), import('./nav.js')])
  await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 1200))])
  const [{ createScene }, { createStory }, { setupJumps }] = await parts
  // oamenii (fisierul cel mai mare) se descarca abia acum, ca pe o retea lenta sa nu imparta banda cu codul scenei;
  // daca nu vin deloc, raman siluetele simple
  const people = import('./scene/humans.js').then((m) => m.loadPeople(peopleUrl, atlasUrl)).catch(() => null)
  // si nu tin scena pe loc: daca intarzie, ea porneste cu siluete si ii primeste dupa. Pe o retea lenta (cand
  // browserul o spune) nici nu ii mai asteptam
  const net = navigator.connection
  const thinNet = !!net && (/2g|3g/.test(net.effectiveType ?? '') || net.saveData)
  const early = await Promise.race([people, new Promise((r) => setTimeout(() => r(undefined), thinNet ? 0 : 800))])
  const q = quality()
  const scene = await createScene(canvas, q, early ?? null)
  if (early === undefined) people.then((m) => scene.upgradePeople(m)).catch(() => {})
  const story = createStory(scene, { reduce })
  // shaderele se compileaza acum, cat panza e inca ascunsa, nu in mijlocul derularii
  await scene.warm().catch(() => {})
  // de aici capitolele stau pe loc si isi schimba textul; fara scena raman o pagina obisnuita.
  // Pana la primul cadru tranzitiile stau oprite: altfel textele tuturor capitolelor s-ar stinge unul peste altul.
  const root = document.documentElement
  root.classList.add('story-snap', 'story-on')

  const fit = () => {
    scene.resize(canvas.clientWidth, canvas.clientHeight)
    story.rebuild()
  }
  fit()
  let pending = 0
  const refit = () => {
    cancelAnimationFrame(pending)
    pending = requestAnimationFrame(fit)
  }
  addEventListener('resize', refit)
  const watch = new ResizeObserver(refit)
  watch.observe(document.querySelector('main'))
  watch.observe(canvas)

  // cat timp n-a miscat nimic: nici pagina, nici cursorul
  let still = 0
  if (matchMedia('(pointer: fine)').matches && !reduce) {
    addEventListener('pointermove', (e) => {
      scene.pointer.x = (e.clientX / innerWidth) * 2 - 1
      scene.pointer.y = (e.clientY / innerHeight) * 2 - 1
      still = 0
    }, { passive: true })
  }

  let y = scrollY
  let last = performance.now()
  // cu miscarea redusa timpul sta pe loc, dupa ce scena s-a aprins toata
  let t = reduce ? 9 : 0

  function draw(dt) {
    const state = story.sample(y, t, scrollY)
    if (story.sceneVisible(y) && !lost) scene.render(t, dt, state)
  }

  // Browserul poate pierde contextul WebGL: telefonul cand iesi din browser si revii sau cand ramane fara memorie,
  // laptopul cand placa video se reseteaza. Panza ar ramane neagra sub text. O ascundem, iar povestea merge mai
  // departe; cand browserul reda contextul, scena se reface si reapare. Daca nu-l reda in cateva secunde cu pagina
  // in fata (iOS de multe ori nu o face), o reincarcare aduce scena inapoi, cel mult o data pe minut, ca sa nu
  // intre in bucla; altfel ramane pagina fara scena.
  let lost = ''
  let lostSince = 0
  canvas.addEventListener('webglcontextlost', () => {
    lost = 'lost'
    lostSince = performance.now()
    canvas.classList.remove('is-ready')
  })
  canvas.addEventListener('webglcontextrestored', () => {
    lost = 'restoring'
    scene.restore().catch(() => {}).then(() => {
      lost = ''
      settle = 30
      draw(0)
      canvas.classList.add('is-ready')
    })
  })
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) lostSince = performance.now()
  })
  function giveUp() {
    lost = 'gone'
    let again = false
    try {
      const at = Number(sessionStorage.getItem('scene-reload')) || 0
      if (Date.now() - at > 60000) {
        sessionStorage.setItem('scene-reload', String(Date.now()))
        again = true
      }
    } catch {}
    if (again) location.reload()
    else withoutScene()
  }

  setupJumps({
    landing: story.landing,
    reduce,
    // dupa un salt, camera e deja la locul ei si cadrul nou e desenat pe loc
    snap() {
      y = scrollY
      draw(0)
    },
  })

  // fiecare capitol trece direct in starea lui; abia de la cadrul urmator textele intra si ies animat
  draw(0)
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('story-snap')))

  // Daca placa video nu tine pasul, calitatea scade in trepte, in orice capitol: intai adancimea de camp, apoi
  // pixelii (cate un sfert), apoi stralucirea, apoi multimea rarita la jumatate. Ritmul de baza e cel mai rapid pe
  // care il prinde ecranul, dar nu sub 60 de cadre: un cadru e intarziat cand trece de o data si jumatate peste el.
  // Economia de baterie tine unele telefoane la 30 de cadre oricat de buna e placa; acolo baza ramane 30 si
  // calitatea nu scade degeaba. Ferestrele sunt scurte (o secunda la 60 de cadre): o placa slaba ajunge in cateva
  // secunde la treapta pe care o duce, nu dupa o jumatate de minut de sacadari.
  const gaps = []
  let base = 0
  let seen = 0
  let late = 0
  let settle = 20
  let done = false
  function adapt(gap) {
    if (done) return
    if (settle > 0) {
      settle--
      return
    }
    if (!base) {
      gaps.push(gap)
      if (gaps.length < 45) return
      gaps.sort((a, b) => a - b)
      base = Math.max(1000 / 60, gaps[4])
      return
    }
    if (gap > base * 1.5) late++
    if (++seen < 60) return
    if (late > 15) {
      const dpr = scene.renderer.getPixelRatio()
      if (scene.hasDof) scene.dropDof()
      else if (dpr > 1) {
        scene.renderer.setPixelRatio(Math.max(1, dpr - 0.25))
        fit()
      } else if (scene.hasBloom) scene.dropBloom()
      else {
        scene.thin(0.5)
        done = true
      }
      // cadrele de imediat dupa (panza realocata) nu se pun la socoteala
      settle = 15
    }
    seen = 0
    late = 0
  }

  // Pe telefoane, cand nu se misca nimic de cateva secunde (cat citesti), scena merge la jumatate de ritm: placa
  // video se incalzeste mai putin si telefonul nu scade singur frecventa mai tarziu, in mijlocul derularii.
  // Cu miscarea redusa scena sta pe loc: atunci o redesenam doar din cand in cand.
  const rest = reduce ? 30 : q.low ? 2 : 1
  let skipped = 0
  let held = 0
  let lastScroll = scrollY

  // Pe ecranele de 120-240 Hz scena se deseneaza tot de vreo 60 de ori pe secunda (din doua, trei sau patru
  // imagini ale ecranului, una): miscarea camerei e lina oricum, iar placa video nu mai lucreaza de patru ori mai
  // mult, cu cadre pierdute din cand in cand. `tick` e intervalul ecranului, cel mai scurt vazut de curand; cu
  // jumatate din el (si o marja de o milisecunda) ecranele de 60-90 Hz deseneaza fiecare imagine.
  const FRAME = 1000 / 60
  let tick = FRAME
  let since = 0

  function frame(now) {
    if (lost === 'gone') return
    requestAnimationFrame(frame)
    if (lost === 'lost' && !document.hidden && now - lostSince > 4000) giveUp()
    const gap = now - last
    last = now
    tick = Math.min(gap, tick * 1.02)
    since += gap
    if (since + tick / 2 < FRAME - 1) return
    const elapsed = since
    since = 0
    const dt = Math.min(0.05, elapsed / 1000)
    if (document.hidden) return
    if (!reduce) t += dt
    y = reduce ? scrollY : y + (scrollY - y) * (1 - Math.exp(-dt * 9))
    if (Math.abs(scrollY - y) < 0.5) y = scrollY
    still = scrollY === lastScroll && y === scrollY ? still + elapsed : 0
    lastScroll = scrollY
    const idle = still > 2500
    if (idle && ++skipped % rest) {
      held += dt
      return
    }
    draw(dt + held)
    held = 0
    if (!idle && !lost && story.sceneVisible(y)) adapt(elapsed)
  }
  requestAnimationFrame((now) => {
    last = now
    canvas.classList.add('is-ready')
    frame(now)
  })
}

/** Fara scena (placa video refuza contextul, bucata cu scena nu s-a descarcat) ramane pagina obisnuita. */
function withoutScene() {
  document.documentElement.classList.remove('story-on', 'in-story')
  document.documentElement.classList.add('no-scene')
}

if (GPU !== null) start().catch(withoutScene)
else withoutScene()
