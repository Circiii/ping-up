import assert from 'node:assert/strict'
import { test } from 'node:test'
import { handle, LATEST_APK, parseRelease, RELEASES_PAGE } from '../lib/release.js'

const release = {
  tag_name: 'v0.2.0',
  published_at: '2026-10-08T10:00:00Z',
  assets: [
    { name: 'notes.txt', size: 10, browser_download_url: 'https://example.com/notes.txt' },
    {
      name: 'ping-up.apk',
      size: 21909808,
      digest: 'sha256:ee3eea85e5fd32d8f7a98dc25d8528c0f375b345525473ac102b8eacf6ef948d',
      browser_download_url: 'https://github.com/dulgherustefan/PingUp/releases/download/v0.2.0/ping-up.apk',
    },
  ],
}

const github = (status, body) => async () => new Response(JSON.stringify(body), { status })

test('parseRelease reads the apk asset of a release', () => {
  assert.deepEqual(parseRelease(release), {
    version: '0.2.0',
    bytes: 21909808,
    sha256: 'ee3eea85e5fd32d8f7a98dc25d8528c0f375b345525473ac102b8eacf6ef948d',
    url: 'https://github.com/dulgherustefan/PingUp/releases/download/v0.2.0/ping-up.apk',
    published: '2026-10-08T10:00:00Z',
  })
})

test('parseRelease returns null when the release has no apk', () => {
  assert.equal(parseRelease({ ...release, assets: [release.assets[0]] }), null)
})

test('parseRelease leaves sha256 empty when GitHub gives no digest', () => {
  const { digest, ...asset } = release.assets[1]
  assert.equal(parseRelease({ ...release, assets: [asset] }).sha256, null)
})

test('handle answers apk.json with the latest release, cached on the CDN', async () => {
  const res = await handle(new Request('https://ping-up.org/api/apk'), { fetch: github(200, release) })
  assert.equal(res.status, 200)
  assert.equal((await res.json()).version, '0.2.0')
  assert.match(res.headers.get('cache-control'), /s-maxage=300/)
})

test('handle redirects the download to the exact asset of the latest release', async () => {
  const res = await handle(new Request('https://ping-up.org/api/apk?download=1'), { fetch: github(200, release) })
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), release.assets[1].browser_download_url)
})

test('handle sends the download to the releases page when there is no release yet', async () => {
  const res = await handle(new Request('https://ping-up.org/api/apk?download=1'), { fetch: github(404, { message: 'Not Found' }) })
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), RELEASES_PAGE)
})

test('handle reports 503 for apk.json when GitHub is unreachable', async () => {
  const res = await handle(new Request('https://ping-up.org/api/apk'), { fetch: async () => { throw new Error('offline') } })
  assert.equal(res.status, 503)
  assert.match(res.headers.get('cache-control'), /s-maxage=60/)
})

test('handle sends the GitHub token when one is configured', async () => {
  let auth = null
  const fetch = async (url, init) => {
    auth = init.headers.authorization
    return new Response(JSON.stringify(release))
  }
  await handle(new Request('https://ping-up.org/api/apk'), { fetch, token: 'abc' })
  assert.equal(auth, 'Bearer abc')
})

test('handle still serves the download when the GitHub API is unreachable', async () => {
  const res = await handle(new Request('https://ping-up.org/api/apk?download=1'), { fetch: github(403, { message: 'rate limit' }) })
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), LATEST_APK)
})

test('handle retries without the token when GitHub rejects it', async () => {
  const seen = []
  const fetch = async (url, init) => {
    seen.push(init.headers.authorization ?? null)
    return init.headers.authorization ? new Response('{}', { status: 401 }) : new Response(JSON.stringify(release))
  }
  const res = await handle(new Request('https://ping-up.org/api/apk'), { fetch, token: 'expired' })
  assert.equal((await res.json()).version, '0.2.0')
  assert.deepEqual(seen, ['Bearer expired', null])
})
