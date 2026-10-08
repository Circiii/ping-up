import './style.css'
import { setupDownload } from './ui/download.js'

setupDownload()

const canvas = document.getElementById('scene')
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches

function webgl() {
  try {
    return !!document.createElement('canvas').getContext('webgl2')
  } catch {
    return false
  }
}

/** Telefoanele modeste primesc mai putina lume, o rezolutie mai mica si scena fara stralucire. */
function quality() {
  const coarse = matchMedia('(pointer: coarse)').matches
  const narrow = Math.min(screen.width, screen.height) < 760
  const cores = navigator.hardwareConcurrency || 4
  const memory = navigator.deviceMemory || 4
  const low = (coarse && narrow) || cores <= 4 || memory <= 3
  return { low, dpr: Math.min(devicePixelRatio || 1, low ? 1.5 : 1.75), density: low ? 0.45 : 1 }
}

async function start() {
  // scena se descarca in timp ce asteptam putin fontul: ecranele LED scriu cu Inter
  const parts = Promise.all([import('./scene/index.js'), import('./story.js'), import('./nav.js')])
  await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 1200))])
  const [{ createScene }, { createStory }, { setupJumps }] = await parts
  const scene = createScene(canvas, quality())
  const story = createStory(scene, { reduce })
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

  if (matchMedia('(pointer: fine)').matches && !reduce) {
    addEventListener('pointermove', (e) => {
      scene.pointer.x = (e.clientX / innerWidth) * 2 - 1
      scene.pointer.y = (e.clientY / innerHeight) * 2 - 1
    }, { passive: true })
  }

  let y = scrollY
  let last = performance.now()
  // cu miscarea redusa timpul sta pe loc, dupa ce scena s-a aprins toata
  let t = reduce ? 9 : 0

  function draw(dt) {
    const state = story.sample(y, t)
    if (story.sceneVisible(y)) scene.render(t, dt, state)
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

  // daca placa video nu tine pasul: intai rezolutia, apoi stralucirea, apoi multimea rarita la jumatate.
  // Economia de baterie (iOS, Android) tine pagina la 30 de cadre pe secunda oricat de buna e placa, deci
  // abia sub ~25 de cadre e vorba de o placa video slaba.
  let frames = 0
  let slow = 0
  let done = false
  function adapt(dt) {
    if (done || ++frames <= 40) return
    if (dt > 0.04) slow++
    if (frames < 170) return
    if (slow < 55) done = true
    else if (scene.renderer.getPixelRatio() > 1) {
      scene.renderer.setPixelRatio(1)
      fit()
    } else if (scene.hasBloom) scene.dropBloom()
    else {
      scene.thin(0.5)
      done = true
    }
    frames = 0
    slow = 0
  }

  function frame(now) {
    requestAnimationFrame(frame)
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    if (document.hidden) return
    if (!reduce) t += dt
    y = reduce ? scrollY : y + (scrollY - y) * (1 - Math.exp(-dt * 9))
    if (Math.abs(scrollY - y) < 0.5) y = scrollY
    draw(dt)
    if (story.sceneVisible(y)) adapt(dt)
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

if (webgl()) start().catch(withoutScene)
else withoutScene()
