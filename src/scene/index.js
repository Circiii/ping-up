import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { createCrowd, WAKE_SPEED } from './crowd.js'
import { createGround, spotColor, zoneInk, zoneTone } from './ground.js'
import { beam, glow, ribbons } from './kit.js'
import { bounceAt, createPeople } from './people.js'
import { createPin } from './pin.js'
import { createPost } from './post.js'
import { createSet } from './set.js'
import { BPM } from './stage.js'
import { createTags } from './tags.js'
import { meeting, meters, pois, STAGE, STAGE2, zones } from './world.js'

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

/** Raportul sigilat, in drum: plicul portocaliu cu lacat, intors mereu spre privitor. */
function capsule() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')
  const fill = g.createLinearGradient(0, 28, 0, 228)
  fill.addColorStop(0, '#FFB648')
  fill.addColorStop(1, '#F08C00')
  g.fillStyle = fill
  g.beginPath()
  g.roundRect(28, 28, 200, 200, 54)
  g.fill()
  g.fillStyle = '#17120A'
  g.beginPath()
  g.roundRect(82, 120, 92, 70, 15)
  g.fill()
  g.lineWidth = 17
  g.lineCap = 'round'
  g.strokeStyle = '#17120A'
  g.beginPath()
  g.arc(128, 120, 28, Math.PI, 0)
  g.stroke()
  g.fillStyle = '#FFB648'
  g.beginPath()
  g.arc(128, 150, 9, 0, Math.PI * 2)
  g.fill()
  g.fillRect(124, 150, 8, 22)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }))
  icon.scale.setScalar(0.78)
  const group = new THREE.Group()
  group.add(glow('#FF9F0A', 2.6, 0.5), icon)
  return { group, icon }
}

const clamp01 = (v) => Math.min(1, Math.max(0, v))
const ease = (t) => t * t * (3 - 2 * t)
const backOut = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2)

/** Cand atinge pinul pamantul, in secunde de la incarcare. De aici pleaca primul ping. */
const LANDING = 1.3

// Iconitele hartii din aplicatie (MapArt.kt), pe grila de 24.
const GLYPHS = {
  exit: 'M4 3h9v4h-2V5H6v14h5v-2h2v4H4Z M15.4 7l5 5-5 5-1.4-1.4 2.6-2.6H9v-2h7.6L14 8.4Z',
  water: 'M12 2.5C9 6.6 5.5 10.6 5.5 14.5a6.5 6.5 0 0 0 13 0C18.5 10.6 15 6.6 12 2.5Z',
  wc: 'M5 4.5a2 2 0 1 0 4 0a2 2 0 1 0-4 0Z M15 4.5a2 2 0 1 0 4 0a2 2 0 1 0-4 0Z M5 8h4l1 7H9v7H5v-7H4Z M15 8h4l2 8h-2v6h-4v-6h-2Z M11.25 3h1.5v18h-1.5Z',
  info: 'M10.75 10h2.5v9h-2.5Z M12 4.5a1.75 1.75 0 1 1 0 3.5a1.75 1.75 0 1 1 0-3.5Z',
  charge: 'M13.5 2L5 13.5h5.5L9.5 22 19 9.5h-5.5Z',
  medical: 'M9.5 3.5h5v6h6v5h-6v6h-5v-6h-6v-5h6Z',
}

export function createScene(canvas, quality) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality.low, powerPreference: 'high-performance' })
  renderer.setPixelRatio(quality.dpr)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.setClearColor('#0E110F', 1)
  // in productie nu mai citim jurnalul fiecarui shader: porneste mai repede si consola ramane curata
  renderer.debug.checkShaderErrors = import.meta.env.DEV

  const scene = new THREE.Scene()
  scene.fog = new THREE.FogExp2('#0E110F', 0.0042)
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environmentIntensity = 0.5
  pmrem.dispose()

  const camera = new THREE.PerspectiveCamera(38, 1, 0.3, 2000)

  const crowd = createCrowd({ density: quality.density })
  const set = createSet(crowd.phones, quality)
  const ground = createGround(set.spots)
  const beatU = crowd.uniforms.shared
  const lightsU = crowd.uniforms.points
  const people = createPeople(crowd.phones, {
    uBeat: beatU.uBeat,
    uBob: beatU.uBob,
    uStageXZ: beatU.uStageXZ,
    uFogColor: beatU.uFogColor,
    uFogDensity: beatU.uFogDensity,
    uTime: beatU.uTime,
    uMesh: beatU.uMesh,
    uReveal: beatU.uReveal,
    uCrowd: lightsU.uCrowd,
    uDim: lightsU.uDim,
    uWake: lightsU.uWake,
    uLightTex: { value: ground.lights },
    uLightRect: { value: new THREE.Vector4(ground.rect.x, ground.rect.z, ground.rect.w, ground.rect.h) },
  }, { detail: quality.low ? 0 : 1, wakeSpeed: WAKE_SPEED })
  people.uniforms.uStage2.value.set(STAGE2.x - 3, STAGE2.z, 0.5)
  scene.add(ground.mesh, set.group, people.mesh, people.solo, crowd.group)

  // ---- pinul, sub reflector ----
  const pin = createPin()
  const you = crowd.you
  pin.root.position.set(you.x, pin.tipOffset + 0.7, you.z)
  scene.add(pin.root)
  ground.uniforms.uPin.value.set(you.x, you.z)
  people.uniforms.uPin.value.set(you.x, you.z)
  const shadow = shadowDisc()
  shadow.position.set(you.x, 0.02, you.z)
  scene.add(shadow)

  // primul ping pleaca atunci cand pinul atinge pamantul
  crowd.uniforms.points.uWake.value.set(you.x, you.z, LANDING)
  ground.uniforms.uWake.value.set(you.x, you.z, LANDING)

  const hemi = new THREE.HemisphereLight('#41513F', '#050605', 1.2)
  const rim = new THREE.DirectionalLight('#CFFFE0', 1.0)
  rim.position.set(you.x - 6, 12, you.z - 30)
  rim.target = pin.root
  const key = new THREE.SpotLight('#F6F8F2', 700, 60, 0.38, 0.7, 1.5)
  key.position.set(you.x + 3, 24, you.z + 7)
  key.target = pin.root
  const bounce = new THREE.PointLight('#30D158', 18, 14, 2)
  bounce.position.set(you.x + 1.5, 1.2, you.z + 3)
  scene.add(hemi, rim, key, bounce)

  const time = { value: 0 }
  const cone = beam(27, 0.35, 4.4, '#EEF3EA', time)
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
      uniforms: { uTime: time, uDpr: { value: quality.dpr }, uOn: { value: 1 } },
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
          vA = max(0.0, 0.4 + 0.6 * sin(uTime * 1.3 + aSeed * 40.0)) * smoothstep(0.4, 2.0, p.y) * (1.0 - smoothstep(9.0, 12.0, p.y));
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
  const sealed = capsule()
  const pack = sealed.group
  pack.visible = false
  scene.add(pack)

  // trecatorul care duce raportul: un om cu telefonul portocaliu, apoi legatura lui cu echipa medicala
  const carry = glow('#FF9F0A', 1.9, 1)
  carry.visible = false
  scene.add(carry)
  const handoff = ribbons(1, '#30D158', 1.6)
  handoff.uniforms.uTail.value = 1
  scene.add(handoff.mesh)
  const handoffPulse = glow('#F4FFF6', 1.8, 1)
  handoffPulse.visible = false
  scene.add(handoffPulse)
  const tentFlash = glow('#30D158', 7, 0)
  tentFlash.position.set(crowd.tent.x, 2, crowd.tent.z)
  scene.add(tentFlash)

  // cei care tin raportul cat nu e nimeni in jur: trei telefoane de la marginea multimii
  const holders = crowd.holders
  const walkStart = new THREE.Vector3(holders[0].x + 0.9, 1.62, holders[0].z + 0.6)
  const walkEnd = new THREE.Vector3(crowd.tent.x - 1.9, 1.62, crowd.tent.z - 0.4)
  const walkFace = Math.atan2(walkEnd.x - walkStart.x, walkEnd.z - walkStart.z)
  const holdGlows = holders.map((h) => {
    const s = glow('#FF9F0A', 2.2, 0)
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
  const meetAway = Math.round(meters([you.x, you.z], meeting) / 10) * 10
  tags.add('you', '<span class="tag__dot"><svg class="i"><use href="#i-place-fill"/></svg></span>Tu', V(you.x, pin.tipOffset * 2 + 1.8, you.z))
  tags.add('ana', '<span class="tag__dot">A</span>Ana', V(crowd.ana.x, crowd.ana.y + 0.6, crowd.ana.z), 'tag--ana')
  tags.add('reporter', '<span class="tag__dot"><svg class="i"><use href="#i-medical"/></svg></span>Raport · Medical', V(crowd.reporter.x, crowd.reporter.y + 0.6, crowd.reporter.z), 'tag--alert')
  tags.add('medic', '<span class="tag__dot"><svg class="i"><use href="#i-medical"/></svg></span>Medical 1', V(crowd.medic.x, crowd.medic.y + 0.6, crowd.medic.z), 'tag--staff')
  tags.add('tower', '<span class="tag__dot tag__dot--red"></span>Antena rețelei', set.tower.top.clone().add(V(-15, -4, 0)), '', '-50%')
  // sub telefon, ca deasupra lui sa ramana loc pentru plicul care trece
  tags.add('focus', 'Telefonul unui străin <small>· ttl ' + (8 - focusHop) + '</small>', V(focus.x, focus.y - 0.22, focus.z), 'tag--plain', '40%')
  tags.add('tent', '<span class="tag__dot"><svg class="i"><use href="#i-medical"/></svg></span>Punct medical', set.tentTop, 'tag--staff')
  tags.add('holders', '<span class="tag__dot"><svg class="i"><use href="#i-clock"/></svg></span>Raport păstrat', V(holders[0].x, 2.7, holders[0].z), 'tag--alert')
  tags.add('meeting', `<span class="tag__dot"><svg class="i"><use href="#i-flag"/></svg></span>Punct de întâlnire <small>· ${meetAway} m</small>`, V(meeting[0], 10.5, meeting[1]), 'tag--alert')
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
  })

  // ---- inelele de ping ----
  let ringSlot = 0
  let lastPing = LANDING
  function emitPing(x, z, strength, t) {
    ground.uniforms.uRing.value[ringSlot].set(x, z, t, strength)
    crowd.uniforms.points.uRing.value[ringSlot].set(x, z, t, strength)
    ringSlot = (ringSlot + 1) % 3
  }

  // ---- stralucirea si culoarea finala; fara ele pe telefoanele modeste ----
  const post = quality.low ? null : createPost(renderer, scene, camera, quality)

  const size = { w: 1, h: 1, dpr: 0 }
  function resize(w, h) {
    // pe telefon bara de adrese apare si dispare; panza ramane la fel, deci nu o realocam
    if (w === size.w && h === size.h && renderer.getPixelRatio() === size.dpr) return
    size.w = w
    size.h = h
    size.dpr = renderer.getPixelRatio()
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    const dpr = renderer.getPixelRatio()
    post?.resize(w, h, dpr)
    crowd.uniforms.edges.uView.value.set((w * dpr) / 2, (h * dpr) / 2)
    crowd.uniforms.edges.uDpr.value = dpr
    crowd.uniforms.points.uDpr.value = dpr
    crowd.uniforms.points.uSize.value = 92 * Math.min(1.3, Math.max(0.7, h / 900))
    handoff.uniforms.uView.value.set((w * dpr) / 2, (h * dpr) / 2)
    handoff.uniforms.uDpr.value = dpr
    set.setView(w, h, dpr)
  }

  const look = new THREE.Vector3()
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 }
  const tmp = new THREE.Vector3()
  const right = new THREE.Vector3()
  const stageAt = [STAGE.x, STAGE.front]
  const lifted = (n, beat, bob) => n.y + bounceAt(n, beat, bob, stageAt)

  function render(t, dt, s) {
    const beat = (t * BPM) / 60
    time.value = t

    // camera: pozitia din poveste, putina paralaxa dupa cursor si o respiratie abia vazuta, ca filmata din mana
    const k = 1 - Math.exp(-dt * 4)
    pointer.sx += (pointer.x - pointer.sx) * k
    pointer.sy += (pointer.y - pointer.sy) * k
    camera.position.set(s.cam[0], s.cam[1], s.cam[2])
    look.set(s.cam[3], s.cam[4], s.cam[5])
    const reach = camera.position.distanceTo(look)
    right.subVectors(look, camera.position).cross(camera.up).normalize()
    camera.position.addScaledVector(right, pointer.sx * 0.9 * s.parallax + Math.sin(t * 0.31) * reach * 0.004)
    camera.position.y += pointer.sy * 0.45 * s.parallax + Math.sin(t * 0.23 + 1.7) * reach * 0.0025
    camera.lookAt(look)
    camera.fov = s.cam[6]
    // obiectivul se muta lateral, ca subiectul sa stea langa text, nu sub el
    camera.setViewOffset(size.w, size.h, s.cam[7] * size.w, s.cam[8] * size.h, size.w, size.h)

    scene.fog.density = s.fog
    beatU.uFogDensity.value = s.fog
    ground.uniforms.uFogDensity.value = s.fog
    beatU.uBeat.value = beat
    beatU.uBob.value = s.stage

    // pinul cade la incarcare, apoi pluteste si se uita spre cursor
    const land = clamp01((t - 0.25) / (LANDING - 0.25))
    const drop = (1 - backOut(land)) * 9
    const bob = Math.sin(t * ((Math.PI * 2) / 3.6)) * 0.22 * land
    const ps = s.pinScale * (0.7 + 0.3 * Math.min(1, land * 1.6))
    pin.root.scale.setScalar(ps)
    pin.root.position.y = (pin.tipOffset + 0.7 + bob) * ps + drop
    tmp.subVectors(camera.position, pin.root.position)
    pin.root.rotation.y = Math.atan2(tmp.x, tmp.z) - 0.38 + pointer.sx * 0.32 * s.parallax
    pin.root.rotation.x = -pointer.sy * 0.1 * s.parallax
    pin.look.value.set(pointer.sx * s.parallax, -pointer.sy * s.parallax)
    const spread = (1 - bob * 0.25) * ps * (0.4 + 0.6 * land)
    shadow.scale.set(5.6 * spread, 3.4 * spread, 1)
    shadow.material.opacity = (0.75 - bob * 0.4) * land
    cone.material.uniforms.uIntensity.value = 0.1 * s.spot
    key.intensity = 700 * (0.35 + 0.65 * s.spot)
    motes.material.uniforms.uOn.value = s.spot
    ground.uniforms.uSpot.value = s.spot
    people.uniforms.uSpot.value = s.spot

    // ping-urile pinului, in prima pagina si la descarcare
    if (s.ping > 0.01 && t - lastPing > 3.6) {
      lastPing = t
      emitPing(you.x, you.z, s.ping, t)
    }

    const pu = crowd.uniforms.points
    const eu = crowd.uniforms.edges
    pu.uTime.value = t
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
    eu.uYouLinks.value = s.youLinks
    eu.uBase.value = s.base
    people.uniforms.uShow.value = clamp01((s.crowd - 0.14) / 0.6)

    ground.uniforms.uMap.value = s.map
    ground.uniforms.uLights.value = 1 - 0.75 * s.map
    ground.uniforms.uHold.value.set(holders[0].x, holders[0].z, 3.2, s.hold)

    const stageLight = set.update(t, dt, s)
    ground.uniforms.uStage.value = stageLight.level
    ground.uniforms.uStageCol.value.copy(stageLight.color)
    people.uniforms.uStage.value = stageLight.level
    people.uniforms.uStageCol.value.copy(stageLight.color)

    // capsula sigilata, pe drumul raportului
    const glowU = people.uniforms.uGlow.value
    glowU.w = 0
    pack.visible = s.capsule > 0
    if (pack.visible) {
      let i = 0
      while (i < reportTimes.length - 2 && s.fa > reportTimes[i + 1]) i++
      const a = reportPath[i]
      const b = reportPath[i + 1]
      const e = ease(clamp01((s.fa - reportTimes[i]) / Math.max(0.01, reportTimes[i + 1] - reportTimes[i])))
      const ay = lifted(a, beat, s.stage)
      const by = lifted(b, beat, s.stage)
      pack.position.set(a.x + (b.x - a.x) * e, ay + (by - ay) * e + 0.5 + Math.sin(e * Math.PI) * 0.9, a.z + (b.z - a.z) * e)
      sealed.icon.material.rotation = Math.sin(t * 2.1) * 0.1
      pack.scale.setScalar(s.capsule)
      glowU.set(pack.position.x, pack.position.y, pack.position.z, 2.6 * s.capsule)
    }

    // trecatorul care duce raportul la cort
    const w = s.walker
    const walking = w > 0
    people.solo.visible = walking
    carry.visible = walking && w < 0.84
    holdGlows.forEach((g) => { g.material.opacity = s.hold * (0.5 + 0.2 * Math.sin(t * 4)) })
    let link = 0
    if (walking) {
      const u = ease(Math.min(1, w / 0.7))
      tmp.lerpVectors(walkStart, walkEnd, u)
      const step = u < 1 ? Math.abs(Math.sin(u * 46)) * 0.07 : 0
      people.moveSolo(tmp.x, tmp.y + step, tmp.z, walkFace)
      carry.position.set(tmp.x, tmp.y + step, tmp.z)
      if (carry.visible) glowU.set(tmp.x, tmp.y + step, tmp.z, 1.1)
      link = clamp01((w - 0.7) / 0.08)
      handoff.set(0, tmp.x, tmp.y, tmp.z, crowd.tent.x, crowd.tent.y, crowd.tent.z, link * 0.9)
      const travel = clamp01((w - 0.76) / 0.1)
      handoffPulse.visible = travel > 0 && travel < 1
      handoffPulse.position.set(tmp.x + (crowd.tent.x - tmp.x) * travel, tmp.y + (crowd.tent.y - tmp.y) * travel, tmp.z + (crowd.tent.z - tmp.z) * travel)
      tentFlash.material.opacity = w > 0.86 ? 0.8 * Math.exp(-(w - 0.86) * 6) + 0.25 : 0
    } else {
      handoff.set(0, 0, 0, 0, 0, 0, 0, 0)
      handoffPulse.visible = false
      tentFlash.material.opacity = 0
    }
    handoff.commit()

    tags.update(camera, size.w, size.h, s.tags)
    if (post) post.render(t, dt)
    else renderer.render(scene, camera)
  }

  return {
    renderer,
    crowd,
    focusHop,
    pointer,
    resize,
    render,
    /** Trepte de rezerva cand placa video nu tine pasul: fara stralucire, apoi cu multimea rarita. */
    get hasBloom() { return !!post?.bloom },
    dropBloom() {
      post?.dropBloom()
    },
    thin(share) {
      people.thin(share)
    },
    /** cate telefoane cu aplicatia sunt in raza data, de la tine */
    meshCount(radius) {
      let n = 0
      for (const p of crowd.nodes) if (Math.hypot(p.x - you.x, p.z - you.z) <= radius) n++
      return n
    },
    spots: { you, ana: crowd.ana, reporter: crowd.reporter, medic: crowd.medic, tent: crowd.tent, focus, meeting, holders: [holders[0].x, holders[0].z] },
    poiCount: pois.length,
  }
}
