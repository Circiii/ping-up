import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { createCrowd } from './crowd.js'
import { createGround, spotColor, zoneInk, zoneTone } from './ground.js'
import { createPin } from './pin.js'
import { beamMaterial, createSet } from './set.js'
import { createTags } from './tags.js'
import { meeting, pois, zones } from './world.js'

/** Sprite moale, aditiv. */
function glow(color, size, opacity = 1) {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.3, 'rgba(255,255,255,.4)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  const tex = new THREE.CanvasTexture(c)
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }))
  s.scale.set(size, size, 1)
  return s
}

/** Umbra moale de sub pin. */
function shadowDisc() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(0,0,0,.75)')
  grad.addColorStop(0.55, 'rgba(0,0,0,.35)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }))
  m.rotation.x = -Math.PI / 2
  return m
}

/** Capsula sigilata: raportul in drum, cu lacatul pe ea. */
function capsule() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  g.fillStyle = '#FF9F0A'
  g.fillRect(0, 0, 128, 128)
  g.fillStyle = '#0E110F'
  g.beginPath()
  g.roundRect(40, 58, 48, 38, 6)
  g.fill()
  g.lineWidth = 9
  g.strokeStyle = '#0E110F'
  g.beginPath()
  g.arc(64, 58, 14, Math.PI, 0)
  g.stroke()
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  const mat = new THREE.MeshStandardMaterial({ map: tex, emissive: '#FF9F0A', emissiveMap: tex, emissiveIntensity: 0.55, roughness: 0.35, metalness: 0.1 })
  const m = new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.46, 0.46, 4, 0.11), mat)
  const halo = glow('#FF9F0A', 2.4, 0.6)
  m.add(halo)
  return m
}

const ease = (t) => t * t * (3 - 2 * t)

// Iconitele hartii din aplicatie (MapArt.kt), pe grila de 24.
const GLYPHS = {
  exit: 'M4 3h9v4h-2V5H6v14h5v-2h2v4H4Z M15.4 7l5 5-5 5-1.4-1.4 2.6-2.6H9v-2h7.6L14 8.4Z',
  water: 'M12 2.5C9 6.6 5.5 10.6 5.5 14.5a6.5 6.5 0 0 0 13 0C18.5 10.6 15 6.6 12 2.5Z',
  wc: 'M5 4.5a2 2 0 1 0 4 0a2 2 0 1 0-4 0Z M15 4.5a2 2 0 1 0 4 0a2 2 0 1 0-4 0Z M5 8h4l1 7H9v7H5v-7H4Z M15 8h4l2 8h-2v6h-4v-6h-2Z M11.25 3h1.5v18h-1.5Z',
  info: 'M10.75 10h2.5v9h-2.5Z M12 4.5a1.75 1.75 0 1 1 0 3.5a1.75 1.75 0 1 1 0-3.5Z',
  charge: 'M13.5 2L5 13.5h5.5L9.5 22 19 9.5h-5.5Z',
  medical: 'M9.5 3.5h5v6h6v5h-6v6h-5v-6h-6v-5h6Z',
}
const backOut = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2)

export function createScene(canvas, quality) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !quality.low, powerPreference: 'high-performance' })
  renderer.setPixelRatio(quality.dpr)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.setClearColor('#0E110F', 1)

  const scene = new THREE.Scene()
  scene.fog = new THREE.FogExp2('#0E110F', 0.0042)
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environmentIntensity = 0.5
  pmrem.dispose()

  const camera = new THREE.PerspectiveCamera(38, 1, 0.3, 2000)

  const crowd = createCrowd({ density: quality.density })
  const set = createSet(crowd.phones, quality)
  const ground = createGround()
  scene.add(ground.mesh, set.group, crowd.group)

  // ---- pinul, sub reflector ----
  const pin = createPin()
  const you = crowd.you
  pin.root.position.set(you.x, pin.tipOffset + 0.7, you.z)
  scene.add(pin.root)
  ground.uniforms.uPin.value.set(you.x, you.z)
  const shadow = shadowDisc()
  shadow.position.set(you.x, 0.02, you.z)
  scene.add(shadow)

  const hemi = new THREE.HemisphereLight('#41513F', '#050605', 1.2)
  const rim = new THREE.DirectionalLight('#CFFFE0', 2.2)
  rim.position.set(you.x - 6, 12, you.z - 30)
  rim.target = pin.root
  const key = new THREE.SpotLight('#F6F8F2', 900, 60, 0.38, 0.7, 1.5)
  key.position.set(you.x + 3, 24, you.z + 7)
  key.target = pin.root
  const bounce = new THREE.PointLight('#30D158', 18, 14, 2)
  bounce.position.set(you.x + 1.5, 1.2, you.z + 3)
  scene.add(hemi, rim, key, bounce)

  const cone = new THREE.Mesh(
    (() => { const g = new THREE.ConeGeometry(4.4, 27, 48, 1, true); g.translate(0, -13.5, 0); return g })(),
    beamMaterial('#EEF3EA', 0.085),
  )
  cone.position.set(you.x + 0.6, 27.4, you.z + 0.4)
  scene.add(cone)

  // praful din lumina reflectorului
  const motes = (() => {
    const n = 90
    const pos = new Float32Array(n * 3)
    const seed = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const r = Math.sqrt(Math.random()) * 3.2
      pos.set([you.x + Math.cos(a) * r, 0.5 + Math.random() * 12, you.z + Math.sin(a) * r], i * 3)
      seed[i] = Math.random()
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uDpr: { value: quality.dpr }, uOn: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        uniform float uTime, uDpr;
        varying float vA;
        void main() {
          vec3 p = position;
          p.y = mod(p.y + uTime * (0.12 + aSeed * 0.2), 12.0) + 0.4;
          p.x += sin(uTime * 0.3 + aSeed * 20.0) * 0.4;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          vA = (0.4 + 0.6 * sin(uTime * 1.3 + aSeed * 40.0)) * smoothstep(0.4, 2.0, p.y) * (1.0 - smoothstep(9.0, 12.0, p.y));
          gl_PointSize = clamp(5.0 * uDpr / -mv.z * 6.0, 1.0, 6.0 * uDpr);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uOn;
        varying float vA;
        void main() {
          vec2 p = gl_PointCoord * 2.0 - 1.0;
          float a = exp(-dot(p, p) * 3.0) * vA * uOn * 0.5;
          gl_FragColor = vec4(vec3(0.9, 0.95, 0.9) * a, 1.0);
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const pts = new THREE.Points(g, m)
    pts.frustumCulled = false
    return pts
  })()
  scene.add(motes)

  // ---- actorii capitolelor ----
  const pack = capsule()
  pack.visible = false
  scene.add(pack)

  const walker = glow('#E9FFEF', 2.6, 1)
  const walkerCarry = glow('#FF9F0A', 1.6, 1)
  walker.add(walkerCarry)
  walkerCarry.position.set(0.5, 0.5, 0)
  walker.visible = false
  scene.add(walker)
  const handoff = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineBasicMaterial({ color: '#30D158', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  handoff.frustumCulled = false
  scene.add(handoff)
  const handoffPulse = glow('#F4FFF6', 1.8, 1)
  handoffPulse.visible = false
  scene.add(handoffPulse)
  const tentFlash = glow('#30D158', 7, 0)
  tentFlash.position.set(crowd.tent.x, 2, crowd.tent.z)
  scene.add(tentFlash)

  // cei care tin raportul cat nu e nimeni in jur: telefoanele cele mai apropiate de marginea multimii
  const holdCenter = [crowd.tent.x - 6, crowd.tent.z - 27]
  const holders = crowd.nodes
    .filter((n) => !n.isolated)
    .map((n) => [Math.hypot(n.x - holdCenter[0], n.z - holdCenter[1]), n])
    .sort((a, b) => a[0] - b[0])
    .slice(0, 3)
    .map((e) => e[1])
  const walkStart = new THREE.Vector3(holders[0].x, 1.6, holders[0].z)
  const walkEnd = new THREE.Vector3(crowd.tent.x - 2.5, 1.6, crowd.tent.z - 5.6)
  const holdGlows = holders.map((h) => {
    const s = glow('#FF9F0A', 2.4, 0)
    s.position.set(h.x, h.y, h.z)
    scene.add(s)
    return s
  })

  // nodul pe care il privim de aproape cand raportul e sigilat
  const reportPath = crowd.path.report
  const focusIndex = Math.max(1, Math.min(reportPath.length - 2, Math.floor(reportPath.length / 2)))
  const focus = reportPath[focusIndex]
  const reportTimes = reportPath.map((n) => crowd.scenarios.report.t[crowd.nodes.indexOf(n)])
  const focusHop = crowd.scenarios.report.hop[crowd.nodes.indexOf(focus)]

  // ---- etichetele ----
  const tags = createTags(document.querySelector('.labels'))
  const V = (x, y, z) => new THREE.Vector3(x, y, z)
  tags.add('you', '<span class="tag__dot"><svg class="i"><use href="#i-place-fill"/></svg></span>Tu', V(you.x, pin.tipOffset * 2 + 1.8, you.z))
  tags.add('ana', '<span class="tag__dot">A</span>Ana', V(crowd.ana.x, crowd.ana.y + 0.6, crowd.ana.z), 'tag--ana')
  tags.add('reporter', '<span class="tag__dot"><svg class="i"><use href="#i-medical"/></svg></span>Raport · Medical', V(crowd.reporter.x, crowd.reporter.y + 0.6, crowd.reporter.z), 'tag--alert')
  tags.add('medic', '<span class="tag__dot"><svg class="i"><use href="#i-medical"/></svg></span>Medical 1', V(crowd.medic.x, crowd.medic.y + 0.6, crowd.medic.z), 'tag--staff')
  tags.add('tower', '<span class="tag__dot" style="background:var(--red)"></span>Antena rețelei', set.tower.top.clone().add(V(0, 4, 0)))
  tags.add('focus', 'Telefonul unui străin <small>· ttl ' + (8 - focusHop) + '</small>', V(focus.x, focus.y + 0.25, focus.z), 'tag--plain')
  tags.add('tent', '<span class="tag__dot"><svg class="i"><use href="#i-medical"/></svg></span>Punct medical', V(crowd.tent.x, 5.6, crowd.tent.z - 2), 'tag--staff')
  tags.add('holders', '<span class="tag__dot"><svg class="i"><use href="#i-clock"/></svg></span>Raport păstrat', V(holders[0].x, 2.6, holders[0].z), 'tag--alert')
  tags.add('meeting', '<span class="tag__dot"><svg class="i"><use href="#i-flag"/></svg></span>Punct de întâlnire', V(meeting[0], 10.5, meeting[1]), 'tag--alert')
  crowd.path.message.slice(1, -1).forEach((n, i) => {
    tags.add(`hop${i + 1}`, `salt ${i + 1}`, V(n.x, n.y + 0.4, n.z), 'tag--plain')
  })
  for (const zn of zones) {
    tags.add(`zone-${zn.id}`, zn.name, V(zn.cx, 0.5, zn.cz + (zn.id === 'main-stage' ? 6 : 0)), 'tag--zone')
    tags.get(`zone-${zn.id}`).el.style.color = zoneInk(zoneTone(zn))
  }
  // punctele utile din harta: cercul colorat cu iconita alba, ca in aplicatie
  pois.forEach((p, i) => {
    const glyph = GLYPHS[p.type]
    if (!glyph) return
    const tag = tags.add(`poi-${i}`, `<svg viewBox="0 0 24 24"><path d="${glyph}"/></svg>`, V(p.at[0], 0.6, p.at[1]), 'tag--poi', true)
    tag.el.style.setProperty('--spot', spotColor(p.type))
    tag.el.title = p.name
  })

  // ---- inelele de ping ----
  let ringSlot = 0
  let lastPing = -2.3
  function emitPing(x, z, strength, t) {
    const r = ground.uniforms.uRing.value[ringSlot]
    r.set(x, z, t, strength)
    crowd.uniforms.points.uRing.value[ringSlot].set(x, z, t, strength)
    ringSlot = (ringSlot + 1) % 3
  }

  // ---- marimea ----
  const size = { w: 1, h: 1 }
  function resize(w, h) {
    size.w = w
    size.h = h
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    const dpr = renderer.getPixelRatio()
    crowd.uniforms.edges.uView.value.set((w * dpr) / 2, (h * dpr) / 2)
    crowd.uniforms.edges.uDpr.value = dpr
    crowd.uniforms.points.uDpr.value = dpr
    crowd.uniforms.points.uSize.value = 92 * Math.min(1.3, Math.max(0.7, h / 900))
    set.bulbs.uniforms.uDpr.value = dpr
  }

  const look = new THREE.Vector3()
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 }
  const tmp = new THREE.Vector3()
  const right = new THREE.Vector3()
  let firstLinkTime = -1

  function render(t, dt, s) {
    // camera, cu putina paralaxa dupa cursor
    const k = 1 - Math.exp(-dt * 4)
    pointer.sx += (pointer.x - pointer.sx) * k
    pointer.sy += (pointer.y - pointer.sy) * k
    camera.position.set(s.cam[0], s.cam[1], s.cam[2])
    look.set(s.cam[3], s.cam[4], s.cam[5])
    right.subVectors(look, camera.position).cross(camera.up).normalize()
    camera.position.addScaledVector(right, pointer.sx * 0.9 * s.parallax)
    camera.position.y += pointer.sy * 0.45 * s.parallax
    camera.lookAt(look)
    camera.fov = s.cam[6]
    // obiectivul se muta lateral, ca subiectul sa stea langa text, nu sub el
    camera.setViewOffset(size.w, size.h, s.cam[7] * size.w, s.cam[8] * size.h, size.w, size.h)

    scene.fog.density = s.fog
    crowd.uniforms.points.uFogDensity.value = s.fog
    ground.uniforms.uFogDensity.value = s.fog

    // pinul cade la incarcare, apoi pluteste si se uita spre cursor
    const land = Math.min(1, Math.max(0, (t - 0.25) / 1.05))
    const drop = (1 - backOut(land)) * 9
    const bob = Math.sin(t * ((Math.PI * 2) / 3.6)) * 0.22 * land
    const ps = s.pinScale * (0.7 + 0.3 * Math.min(1, land * 1.6))
    pin.root.scale.setScalar(ps)
    pin.root.position.y = (pin.tipOffset + 0.7 + bob) * ps + drop
    tmp.subVectors(camera.position, pin.root.position)
    const face = Math.atan2(tmp.x, tmp.z)
    pin.root.rotation.y = face - 0.38 + pointer.sx * 0.32 * s.parallax
    pin.root.rotation.x = -pointer.sy * 0.1 * s.parallax
    pin.look.value.set(pointer.sx * s.parallax, -pointer.sy * s.parallax)
    const spread = (1 - bob * 0.25) * ps * (0.4 + 0.6 * land)
    shadow.scale.set(5.6 * spread, 3.4 * spread, 1)
    shadow.material.opacity = (0.75 - bob * 0.4) * land
    cone.material.uniforms.uIntensity.value = 0.085 * s.spot
    key.intensity = 900 * (0.35 + 0.65 * s.spot)
    motes.material.uniforms.uTime.value = t
    motes.material.uniforms.uOn.value = s.spot
    ground.uniforms.uSpot.value = s.spot

    // ping-urile pinului, in prima pagina si la descarcare
    if (s.ping > 0.01 && t - lastPing > 3.6) {
      lastPing = t
      emitPing(you.x, you.z, s.ping, t)
      if (firstLinkTime < 0) firstLinkTime = t + 0.35
    }

    const pu = crowd.uniforms.points
    const eu = crowd.uniforms.edges
    pu.uTime.value = t
    eu.uTime.value = t
    ground.uniforms.uTime.value = t
    pu.uCrowd.value = s.crowd
    pu.uDim.value = s.dim
    pu.uMesh.value = s.mesh
    pu.uReveal.value = s.reveal
    crowd.load('a', s.chA)
    crowd.load('b', s.chB)
    pu.uFa.value = s.fa
    pu.uFb.value = s.fb
    pu.uColA.value.set(s.colA)
    pu.uColB.value.set(s.colB)
    const heroLinks = firstLinkTime >= 0 ? ease(Math.min(1, Math.max(0, (t - firstLinkTime) / 0.8))) : 0
    eu.uYouLinks.value = Math.max(s.youLinks, heroLinks * s.ping)
    eu.uBase.value = s.base

    ground.uniforms.uMap.value = s.map
    ground.uniforms.uStage.value = s.stage
    ground.uniforms.uHold.value.set(holders[0].x, holders[0].z, 3.2, s.hold)

    set.led.show(s.led)
    for (const sl of set.sideLeds) sl.show(s.led === 'nosignal' ? 'side-off' : 'side')
    set.led2.show(s.led === 'nosignal' ? 'nosignal' : 'logo')
    set.update(t, s)

    // capsula sigilata, pe drumul raportului
    pack.visible = s.capsule > 0
    if (pack.visible) {
      const ts = reportTimes
      let i = 0
      while (i < ts.length - 2 && s.fa > ts[i + 1]) i++
      const a = reportPath[i]
      const b = reportPath[i + 1]
      const u = Math.min(1, Math.max(0, (s.fa - ts[i]) / Math.max(0.01, ts[i + 1] - ts[i])))
      const e = ease(u)
      pack.position.set(a.x + (b.x - a.x) * e, a.y + 0.5 + Math.sin(e * Math.PI) * 0.9, a.z + (b.z - a.z) * e)
      pack.rotation.set(t * 0.8, t * 1.1, 0)
      pack.scale.setScalar(0.85 * s.capsule)
    }

    // trecatorul care duce raportul la cort
    const w = s.walker
    walker.visible = w > 0
    holdGlows.forEach((g) => { g.material.opacity = s.hold * (0.55 + 0.25 * Math.sin(t * 4)) })
    if (walker.visible) {
      const u = ease(Math.min(1, w / 0.7))
      walker.position.lerpVectors(walkStart, walkEnd, u)
      walker.position.y = 1.6 + Math.abs(Math.sin(u * 22)) * 0.08
      walkerCarry.material.opacity = w < 0.82 ? 1 : 0
      const link = Math.min(1, Math.max(0, (w - 0.7) / 0.08))
      const pos = handoff.geometry.attributes.position
      pos.setXYZ(0, walker.position.x, walker.position.y, walker.position.z)
      pos.setXYZ(1, crowd.tent.x, crowd.tent.y, crowd.tent.z)
      pos.needsUpdate = true
      handoff.material.opacity = link * 0.9
      const travel = Math.min(1, Math.max(0, (w - 0.76) / 0.1))
      handoffPulse.visible = travel > 0 && travel < 1
      handoffPulse.position.lerpVectors(walker.position, tmp.set(crowd.tent.x, crowd.tent.y, crowd.tent.z), travel)
      tentFlash.material.opacity = w > 0.86 ? 0.8 * Math.exp(-(w - 0.86) * 6) + 0.25 : 0
    } else {
      handoff.material.opacity = 0
      handoffPulse.visible = false
      tentFlash.material.opacity = 0
    }

    tags.update(camera, size.w, size.h, s.tags)
    renderer.render(scene, camera)
  }

  return {
    renderer,
    camera,
    crowd,
    focus,
    focusHop,
    pointer,
    resize,
    render,
    /** cate telefoane cu aplicatia sunt in raza data, de la tine */
    meshCount(radius) {
      let n = 0
      for (const p of crowd.nodes) if (Math.hypot(p.x - you.x, p.z - you.z) <= radius) n++
      return n
    },
    spots: { you, ana: crowd.ana, reporter: crowd.reporter, medic: crowd.medic, tent: crowd.tent, focus, meeting, holders: holdCenter },
    poiCount: pois.length,
  }
}
