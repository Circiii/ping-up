import { appendFileSync, existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// Numele aplicatiei, versiunea si Android-ul minim stau doar in app.json.
const site = fileURLToPath(new URL('.', import.meta.url))
const app = JSON.parse(readFileSync(resolve(site, 'app.json'), 'utf8'))

const appName = app.name
const version = app.version
const minSdk = app.minSdk
const androidNames = { 26: '8.0', 27: '8.1', 28: '9', 29: '10', 30: '11', 31: '12', 32: '12L', 33: '13', 34: '14', 35: '15', 36: '16' }
const minAndroid = androidNames[minSdk] ?? String(minSdk)

const tokens = { APP_NAME: appName, VERSION: version, MIN_ANDROID: minAndroid }

// Aceleasi iconite ca in aplicatie: Phosphor 2.1.1, adunate intr-un sprite pus direct in pagina.
const icons = {
  download: 'regular/download-simple',
  android: 'fill/android-logo-fill',
  'arrow-down': 'regular/arrow-down',
  lock: 'regular/lock-simple',
  bluetooth: 'regular/bluetooth',
  copy: 'regular/copy',
  check: 'bold/check-bold',
  'check-circle': 'regular/check-circle',
  'check-circle-fill': 'fill/check-circle-fill',
  clock: 'regular/clock',
  medical: 'regular/first-aid-kit',
  fight: 'regular/hand-fist',
  lost: 'regular/user-focus',
  harassment: 'regular/hand-palm',
  crowd: 'regular/users-three',
  fire: 'regular/fire',
  other: 'regular/dots-three',
  priority: 'bold/exclamation-mark-bold',
  hidden: 'regular/eye-slash',
  history: 'regular/clock-counter-clockwise',
  place: 'regular/map-pin',
  'place-fill': 'fill/map-pin-fill',
  back: 'bold/caret-left-bold',
  plus: 'bold/plus-bold',
  send: 'bold/arrow-up-bold',
  chevron: 'bold/caret-right-bold',
  'chat-fill': 'fill/chat-circle-fill',
  'report-fill': 'fill/warning-octagon-fill',
  'map-fill': 'fill/map-trifold-fill',
  'bell-fill': 'fill/bell-fill',
  qr: 'regular/qr-code',
  github: 'regular/github-logo',
  x: 'bold/x-bold',
  walk: 'regular/person-simple-walk',
  flag: 'regular/flag',
  shield: 'regular/shield-check',
  more: 'bold/dots-three-bold',
}

function sprite() {
  const base = resolve(site, 'node_modules', '@phosphor-icons', 'core', 'assets')
  const symbols = Object.entries(icons).map(([id, file]) => {
    const svg = readFileSync(resolve(base, `${file}.svg`), 'utf8')
    const inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
    return `<symbol id="i-${id}" viewBox="0 0 256 256">${inner}</symbol>`
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden">${symbols.join('')}</svg>`
}

/** licente.txt are licentele bibliotecilor din bundle (de la Vite); aici se adauga fontul si iconitele. */
const assetLicenses = {
  name: 'asset-licenses',
  apply: 'build',
  writeBundle({ dir }) {
    const folder = resolve(site, 'licenses')
    for (const file of readdirSync(folder).sort()) {
      appendFileSync(resolve(dir, 'licente.txt'), `\n## ${file.replace(/\.txt$/, '')}\n\n${readFileSync(resolve(folder, file), 'utf8')}`)
    }
  },
}

export default defineConfig(({ command }) => {
  if (command === 'build' && !existsSync(resolve(site, 'public', 'ping-up.apk'))) {
    console.warn('Lipseste public/ping-up.apk: butonul de descarcare nu va avea fisier. Ruleaza intai npm run apk.')
  }
  return {
    base: './',
    plugins: [
      assetLicenses,
      {
        name: 'app-tokens',
        transformIndexHtml: (html) => html
          .replace('<!--icons-->', sprite())
          .replace(/\{\{(APP_NAME|VERSION|MIN_ANDROID)\}\}/g, (_, key) => tokens[key]),
      },
    ],
    server: {
      host: true,
    },
    build: {
      target: 'es2020',
      assetsInlineLimit: 0,
      license: { fileName: 'licente.txt' },
      rolldownOptions: {
        output: { postBanner: '/*! Licentele bibliotecilor incluse: licente.txt */' },
      },
      // three.js sta singur in bucata scenei, incarcata dupa text
      chunkSizeWarningLimit: 720,
    },
  }
})
