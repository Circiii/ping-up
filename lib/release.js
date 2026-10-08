// APK-ul nu mai sta in site: il ia din ultimul release al aplicatiei de pe GitHub. Un release nou
// apare pe site in cateva minute, fara deploy.
export const REPO = 'dulgherustefan/PingUp'
export const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`
// link stabil spre APK-ul ultimului release, fara API: merge si cand GitHub limiteaza cererile
export const LATEST_APK = `https://github.com/${REPO}/releases/latest/download/ping-up.apk`
const API = `https://api.github.com/repos/${REPO}/releases/latest`

/** Ce afiseaza butonul de descarcare, din raspunsul GitHub; null daca release-ul nu are APK. */
export function parseRelease(release) {
  const apks = (release?.assets ?? []).filter((a) => a.name.endsWith('.apk'))
  const asset = apks.find((a) => a.name === 'ping-up.apk') ?? apks[0]
  if (!asset) return null
  const digest = /^sha256:([0-9a-f]{64})$/.exec(asset.digest ?? '')
  return {
    version: release.tag_name.replace(/^v/, ''),
    bytes: asset.size,
    sha256: digest ? digest[1] : null,
    url: asset.browser_download_url,
    published: release.published_at,
  }
}

/** Ultimul release cu APK; null daca nu exista inca. Arunca daca GitHub nu raspunde. */
export async function latestRelease({ fetch = globalThis.fetch, token, timeout = 8000 } = {}) {
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'ping-up.org' }
  if (token) headers.authorization = `Bearer ${token}`
  const res = await fetch(API, { headers, signal: AbortSignal.timeout(timeout) })
  // un token expirat nu trebuie sa opreasca site-ul: se reincearca fara el
  if (res.status === 401 && token) return latestRelease({ fetch, timeout })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`GitHub ${res.status}`)
  return parseRelease(await res.json())
}

// CDN-ul tine raspunsul 5 minute; daca GitHub cade, serveste mai departe ce stia.
const FRESH = 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400, stale-if-error=86400'
const BRIEF = 'public, max-age=0, s-maxage=60'

/** /apk.json si /ping-up.apk (rescrise spre /api/apk, cu ?download pentru fisier). */
export async function handle(request, options = {}) {
  const download = new URL(request.url).searchParams.has('download')
  let info = null
  let failed = false
  try {
    info = await latestRelease(options)
  } catch {
    failed = true
  }
  if (download) {
    const location = info ? info.url : failed ? LATEST_APK : RELEASES_PAGE
    return new Response(null, { status: 302, headers: { location, 'cache-control': info ? FRESH : BRIEF } })
  }
  if (!info) {
    return Response.json({ error: failed ? 'github' : 'none', page: RELEASES_PAGE }, { status: 503, headers: { 'cache-control': BRIEF } })
  }
  return Response.json(info, { headers: { 'cache-control': FRESH } })
}
