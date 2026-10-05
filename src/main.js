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

/** Telefoanele modeste primesc mai putine lumini si o rezolutie mai mica. */
function quality() {
  const coarse = matchMedia('(pointer: coarse)').matches
  const narrow = Math.min(screen.width, screen.height) < 760
  const cores = navigator.hardwareConcurrency || 4
  const memory = navigator.deviceMemory || 4
  const low = (coarse && narrow) || cores <= 4 || memory <= 3
  return { low, dpr: Math.min(devicePixelRatio || 1, low ? 1.5 : 2), density: low ? 0.55 : 1 }
}

async function start() {
  // ecranul LED scrie cu Inter, deci asteptam fontul putin
  await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 1200))])
  const [{ createScene }, { createStory }] = await Promise.all([import('./scene/index.js'), import('./story.js')])
  const q = quality()
  const scene = createScene(canvas, q)
  const story = createStory(scene)

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
  new ResizeObserver(refit).observe(document.querySelector('main'))

  if (matchMedia('(pointer: fine)').matches && !reduce) {
    addEventListener('pointermove', (e) => {
      scene.pointer.x = (e.clientX / innerWidth) * 2 - 1
      scene.pointer.y = (e.clientY / innerHeight) * 2 - 1
    }, { passive: true })
  }

  let y = scrollY
  let last = performance.now()
  let t = reduce ? 4 : 0
  let frames = 0
  let slow = 0
  let downgraded = false

  function frame(now) {
    requestAnimationFrame(frame)
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    if (document.hidden) return
    if (!reduce) t += dt
    y = reduce ? scrollY : y + (scrollY - y) * (1 - Math.exp(-dt * 9))
    if (Math.abs(scrollY - y) < 0.5) y = scrollY
    if (!story.sceneVisible(y)) return
    const state = story.sample(y, t)
    scene.render(t, dt, state)

    // daca telefonul nu tine pasul, scadem rezolutia o singura data
    if (!downgraded && ++frames > 30) {
      if (dt > 0.03) slow++
      if (frames > 150) {
        if (slow > 60) {
          scene.renderer.setPixelRatio(1)
          scene.resize(canvas.clientWidth, canvas.clientHeight)
        }
        downgraded = true
      }
    }
  }
  requestAnimationFrame((now) => {
    last = now
    canvas.classList.add('is-ready')
    frame(now)
  })
}

if (webgl()) start()
