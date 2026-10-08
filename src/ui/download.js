const APK = 'ping-up.apk'

function mb(bytes) {
  return (bytes / 1048576).toLocaleString('ro-RO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

/** Codul QR desenat ca SVG: module inchise pe fondul deschis, ca pe cardul din aplicatie. */
function qrSvg(qrcode, text) {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  const n = qr.getModuleCount()
  let d = ''
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`
  }
  return `<svg viewBox="-1 -1 ${n + 2} ${n + 2}" role="img" aria-label="Cod QR cu linkul de descărcare" shape-rendering="crispEdges"><path fill="#0E110F" d="${d}"/></svg>`
}

export function setupDownload() {
  const ua = navigator.userAgent
  const android = /Android/i.test(ua)
  const ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

  // pe Android, butonul din prima pagina descarca direct
  if (android) {
    for (const a of document.querySelectorAll('[data-download-link]')) {
      a.href = APK
      a.setAttribute('download', '')
    }
  }

  // pe iPhone APK-ul nu se poate instala: butonul nu mai descarca degeaba 20 MB
  if (ios) {
    const btn = document.querySelector('[data-apk]')
    btn.removeAttribute('href')
    btn.removeAttribute('download')
    btn.setAttribute('aria-disabled', 'true')
    btn.classList.add('is-off')
    btn.querySelector('[data-apk-label]').textContent = 'Doar pentru Android'
  }

  // codul QR e doar pentru calculator; telefoanele nu descarca generatorul
  if (!android && !ios) {
    import('qrcode-generator').then(({ default: qrcode }) => {
      const box = document.querySelector('[data-qr]')
      box.querySelector('[data-qr-code]').innerHTML = qrSvg(qrcode, new URL(APK, location.href).href)
      box.hidden = false
    })
  }

  // amprentele stau intr-un panou strans; fara niciuna (fara certificat in app.json si fara SHA-256), panoul nu apare
  const verify = document.querySelector('[data-verify]')
  const anyPrint = () => !!verify?.querySelector('.dl__hash:not([hidden])')
  if (verify) verify.hidden = !anyPrint()

  // ultimul release al aplicatiei, ca pagina sa nu ramana la versiunea de la ultimul deploy
  fetch('apk.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .then((info) => {
      if (!info) return
      document.querySelector('[data-apk-size]').textContent = `APK · ${mb(info.bytes)} MB`
      for (const el of document.querySelectorAll('[data-apk-version]')) el.textContent = info.version
      if (!info.sha256) return
      const hash = document.querySelector('[data-hash]')
      hash.querySelector('[data-hash-value]').textContent = info.sha256
      hash.hidden = false
      if (verify) verify.hidden = false
    })
    .catch(() => {})

  const copy = document.querySelector('[data-copy-hash]')
  copy?.addEventListener('click', async () => {
    const value = document.querySelector('[data-hash-value]').textContent
    const label = copy.querySelector('span')
    try {
      await navigator.clipboard.writeText(value)
      label.textContent = 'Copiat'
    } catch {
      const range = document.createRange()
      range.selectNodeContents(document.querySelector('[data-hash-value]'))
      getSelection().removeAllRanges()
      getSelection().addRange(range)
      label.textContent = 'Selectat'
    }
    setTimeout(() => { label.textContent = 'Copiază' }, 1800)
  })
}
