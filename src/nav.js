// Linkurile catre sectiuni. Pana la sectiunea vecina pagina aluneca incet, cu camera dupa ea.
// Mai departe de atat nu zboara prin toate capitolele: imaginea se topeste direct in cea noua.
const easeInOut = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2)

export function setupJumps({ landing, snap, reduce }) {
  const curtain = document.querySelector('.curtain')
  let glide = 0
  let busy = false

  const stop = () => {
    cancelAnimationFrame(glide)
    glide = 0
  }
  // orice gest al omului opreste alunecarea
  for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown']) addEventListener(type, stop, { passive: true })

  function slide(to) {
    const from = scrollY
    const ms = Math.min(1500, Math.max(700, 520 + Math.abs(to - from) * 0.62))
    const t0 = performance.now()
    const step = (now) => {
      const u = Math.min(1, (now - t0) / ms)
      scrollTo(0, from + (to - from) * easeInOut(u))
      glide = u < 1 ? requestAnimationFrame(step) : 0
    }
    glide = requestAnimationFrame(step)
  }

  function dissolve(to) {
    const move = () => {
      scrollTo(0, to)
      snap()
    }
    busy = true
    const done = () => { busy = false }
    if (document.startViewTransition) {
      document.startViewTransition(move).finished.then(done, done)
      return
    }
    // browserele fara tranzitii de pagina primesc o cortina scurta
    curtain.classList.add('is-on')
    setTimeout(() => {
      move()
      requestAnimationFrame(() => requestAnimationFrame(() => {
        curtain.classList.remove('is-on')
        done()
      }))
    }, 190)
  }

  function go(id, instant = false) {
    const to = landing(id)
    if (to == null || busy) return false
    stop()
    const dist = Math.abs(to - scrollY)
    if (dist < 2) return true
    if (instant || reduce) {
      scrollTo(0, to)
      snap()
    } else if (dist < innerHeight * 1.7) slide(to)
    else dissolve(to)
    return true
  }

  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    const link = e.target.closest('a[href^="#"]')
    if (!link) return
    const id = decodeURIComponent(link.getAttribute('href').slice(1))
    const target = document.getElementById(id)
    if (!target) return
    e.preventDefault()
    if (!go(id)) return
    if (location.hash !== `#${id}`) history.pushState(null, '', `#${id}`)
    // tastatura si cititoarele de ecran continua din sectiunea noua
    target.setAttribute('tabindex', '-1')
    target.focus({ preventScroll: true })
  })

  addEventListener('popstate', () => go(decodeURIComponent(location.hash.slice(1)) || 'acasa'))

  // pagina deschisa direct pe o sectiune
  if (location.hash.length > 1) go(decodeURIComponent(location.hash.slice(1)), true)
}
