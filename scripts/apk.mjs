// Pune un APK nou langa site: il copiaza in public/ping-up.apk si scrie public/apk.json (versiune, marime,
// SHA-256), ca butonul de descarcare sa arate exact fisierul servit. Versiunea ajunge si in app.json.
// Folosire: npm run apk -- cale/catre/app-debug.apk
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const site = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : null

if (!source || !existsSync(source)) {
  console.error('Da calea APK-ului: npm run apk -- cale/catre/app-debug.apk')
  process.exit(1)
}

const app = JSON.parse(readFileSync(join(site, 'app.json'), 'utf8'))
const meta = join(dirname(source), 'output-metadata.json')
const version = existsSync(meta) ? JSON.parse(readFileSync(meta, 'utf8')).elements?.[0]?.versionName ?? app.version : app.version

const bytes = readFileSync(source)
copyFileSync(source, join(site, 'public', 'ping-up.apk'))

const info = {
  file: 'ping-up.apk',
  version,
  bytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  built: statSync(source).mtime.toISOString(),
}
writeFileSync(join(site, 'public', 'apk.json'), JSON.stringify(info, null, 2) + '\n')
if (app.version !== version) writeFileSync(join(site, 'app.json'), JSON.stringify({ ...app, version }, null, 2) + '\n')
console.log(`${source}\n-> public/ping-up.apk  ${version}  ${(info.bytes / 1048576).toFixed(1)} MB  ${info.sha256}`)
