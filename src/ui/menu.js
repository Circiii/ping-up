// Pe ecranele inguste linkurile sectiunilor stau intr-un meniu, sub bara de sus. Se inchide cand alegi o sectiune,
// la Escape, la o atingere in afara lui si cand ecranul se lateste destul cat sa incapa linkurile in bara.
export function setupMenu() {
  const nav = document.querySelector('[data-nav]')
  const toggle = nav?.querySelector('.nav__toggle')
  const links = nav?.querySelector('.nav__links')
  if (!toggle || !links) return
  // fara JavaScript butonul n-ar face nimic, asa ca apare abia acum
  toggle.hidden = false

  const isOpen = () => nav.classList.contains('is-open')
  const set = (open) => {
    nav.classList.toggle('is-open', open)
    toggle.setAttribute('aria-expanded', String(open))
  }

  toggle.addEventListener('click', () => set(!isOpen()))
  links.addEventListener('click', (e) => {
    if (e.target.closest('a')) set(false)
  })
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !isOpen()) return
    set(false)
    toggle.focus()
  })
  addEventListener('pointerdown', (e) => {
    if (isOpen() && !nav.contains(e.target)) set(false)
  })
  matchMedia('(min-width: 901px)').addEventListener('change', () => set(false))
}
