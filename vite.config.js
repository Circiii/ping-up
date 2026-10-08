import { appendFileSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { handle, latestRelease } from './lib/release.js'

// Numele aplicatiei si Android-ul minim stau in app.json. Versiunea vine din ultimul release de pe GitHub;
// pagina o reimprospateaza oricum la incarcare, aici e doar pentru cine o deschide fara JavaScript.
const site = fileURLToPath(new URL('.', import.meta.url))
const app = JSON.parse(readFileSync(resolve(site, 'app.json'), 'utf8'))

const appName = app.name
const minSdk = app.minSdk
const androidNames = { 26: '8.0', 27: '8.1', 28: '9', 29: '10', 30: '11', 31: '12', 32: '12L', 33: '13', 34: '14', 35: '15', 36: '16' }
const minAndroid = androidNames[minSdk] ?? String(minSdk)
// Amprenta certificatului cu care e semnat APK-ul, din notele release-ului. Sta aici, nu pe GitHub: un APK
// pus acolo de altcineva nu o poate schimba si pe site.
const cert = (app.certSha256 ?? '').replace(/[^0-9a-f]/gi, '').toUpperCase().match(/../g)?.join(':') ?? ''

async function releasedVersion() {
  try {
    return (await latestRelease({ token: process.env.GITHUB_TOKEN, timeout: 5000 }))?.version ?? app.version
  } catch {
    return app.version
  }
}

/**
 * In dev, /apk.json si /ping-up.apk raspund la fel ca functia de pe Vercel. Raspunsul GitHub sta 5 minute in
 * memorie, ca reincarcarile paginii sa nu consume cele 60 de cereri pe ora.
 */
let github = null
async function cachedFetch(url, init) {
  if (!github || Date.now() - github.at > 300000) {
    const res = await fetch(url, init)
    github = { at: Date.now(), status: res.status, body: await res.text() }
  }
  return new Response(github.body, { status: github.status })
}

const releaseRoutes = {
  name: 'release-routes',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const path = req.url.split('?')[0]
      if (!path.endsWith('/apk.json') && !path.endsWith('/ping-up.apk')) return next()
      const url = new URL(path.endsWith('.apk') ? '/api/apk?download=1' : '/api/apk', 'http://localhost')
      const out = await handle(new Request(url), { token: process.env.GITHUB_TOKEN, fetch: cachedFetch })
      res.statusCode = out.status
      out.headers.forEach((v, k) => res.setHeader(k, v))
      res.end(Buffer.from(await out.arrayBuffer()))
    })
  },
}

// Aceleasi iconite ca in aplicatie: Phosphor 2.1.1, adunate intr-un sprite pus direct in pagina.
const icons = {
  download: 'regular/download-simple',
  android: 'fill/android-logo-fill',
  'arrow-down': 'regular/arrow-down',
  lock: 'regular/lock-simple',
  copy: 'regular/copy',
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
  chevron: 'bold/caret-right-bold',
  flag: 'regular/flag',
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

export default defineConfig(async ({ command }) => {
  const version = command === 'build' ? await releasedVersion() : app.version
  const tokens = { APP_NAME: appName, VERSION: version, MIN_ANDROID: minAndroid, CERT: cert }
  return {
    base: './',
    plugins: [
      releaseRoutes,
      assetLicenses,
      {
        name: 'app-tokens',
        transformIndexHtml: (html) => html
          .replace('<!--icons-->', sprite())
          .replace(/<!--cert-->([\s\S]*?)<!--\/cert-->/, cert ? '$1' : '')
          .replace(/\{\{(APP_NAME|VERSION|MIN_ANDROID|CERT)\}\}/g, (_, key) => tokens[key]),
      },
    ],
    build: {
      target: 'es2020',
      assetsInlineLimit: 0,
      license: { fileName: 'licente.txt' },
      rolldownOptions: {
        input: {
          main: resolve(site, 'index.html'),
          confidentialitate: resolve(site, 'confidentialitate.html'),
          404: resolve(site, '404.html'),
        },
        output: { postBanner: '/*! Licentele bibliotecilor incluse: licente.txt */' },
      },
      // three.js sta singur in bucata scenei, incarcata dupa text
      chunkSizeWarningLimit: 720,
    },
  }
})
