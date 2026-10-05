import * as THREE from 'three'
import { bounds, meeting, SPOTS, STAGE, STAGE2, zone } from './world.js'
import { rng } from './crowd.js'

const dark = (hex, rough = 0.85) => new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: 0.15, envMapIntensity: 0.25 })
const glowColor = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k)

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  m.position.set(x, y, z)
  return m
}

function emissive(hex, k = 1) {
  return new THREE.MeshBasicMaterial({ color: glowColor(hex, k), fog: true, toneMapped: false })
}

/** Conul de lumina: mai aprins la sursa si in mijloc, stins spre margini si spre baza. */
export function beamMaterial(color, intensity = 1) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uIntensity: { value: intensity } },
    vertexShader: /* glsl */ `
      varying float vH;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vH = uv.y;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vV = normalize(-mv.xyz);
        vN = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      varying float vH;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float facing = abs(dot(vN, vV));
        float a = pow(facing, 2.2) * pow(vH, 1.7) * uIntensity;
        gl_FragColor = vec4(uColor * a, 1.0);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })
}

function beam(length, radius, color, intensity) {
  const g = new THREE.ConeGeometry(radius, length, 40, 1, true)
  g.translate(0, -length / 2, 0)
  return new THREE.Mesh(g, beamMaterial(color, intensity))
}

/** Un sprite moale, pentru lumini care trebuie doar sa straluceasca. */
let glowTexture
function glowSprite(color, size, opacity = 1) {
  if (!glowTexture) {
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const g = c.getContext('2d')
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(0.25, 'rgba(255,255,255,.45)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 128, 128)
    glowTexture = new THREE.CanvasTexture(c)
    glowTexture.colorSpace = THREE.SRGBColorSpace
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }))
  s.scale.set(size, size, 1)
  return s
}

/** Ecranul LED din spatele scenei: o retea de becuri care arata ce scrie pe o panza. */
function ledWall(width, height, cols) {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = Math.round((1024 * height) / width)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  const rows = Math.round((cols * height) / width)
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: tex }, uCells: { value: new THREE.Vector2(cols, rows) }, uBright: { value: 1 }, uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform sampler2D uTex;
      uniform vec2 uCells;
      uniform float uBright;
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        vec2 g = vUv * uCells;
        vec2 c = (floor(g) + 0.5) / uCells;
        vec3 t = texture2D(uTex, c).rgb;
        float led = 1.0 - smoothstep(0.26, 0.44, length(fract(g) - 0.5));
        float scan = 0.92 + 0.08 * sin(vUv.y * 40.0 - uTime * 3.0);
        vec3 col = t * led * 1.6 * scan * uBright + vec3(0.012, 0.016, 0.013) * led;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
    toneMapped: false,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat)
  let current = ''
  const ctx = canvas.getContext('2d')
  function show(mode) {
    if (mode === current) return
    current = mode
    const W = canvas.width
    const H = canvas.height
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, W, H)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const text = (s, color, size, y = H / 2) => {
      ctx.fillStyle = color
      ctx.font = `800 ${size}px Inter, system-ui, sans-serif`
      ctx.fillText(s, W / 2, y)
    }
    if (mode === 'side') {
      text('PING', '#F4F6F0', W * 0.34, H * 0.4)
      text('UP', '#30D158', W * 0.34, H * 0.62)
    } else if (mode === 'side-off') {
      text('SOS', '#FF453A', W * 0.3)
    } else if (mode === 'nosignal') {
      text('FĂRĂ SEMNAL', '#FF453A', H * 0.36)
    } else if (mode === 'mesh') {
      text('PING UP', '#30D158', H * 0.42, H * 0.44)
      text('REȚEA PORNITĂ', '#D3D8B2', H * 0.13, H * 0.8)
    } else if (mode === 'help') {
      text('AJUTORUL VINE', '#F4F6F0', H * 0.24, H * 0.36)
      text('DIN TELEFON ÎN TELEFON', '#30D158', H * 0.17, H * 0.68)
    } else {
      text('PING UP', '#F4F6F0', H * 0.46, H * 0.48)
    }
    tex.needsUpdate = true
  }
  return { mesh, show, uniforms: mat.uniforms }
}

/** Antena de telefonie de pe deal: zabrele, panouri si becul rosu din varf. */
function tower(x, z) {
  const g = new THREE.Group()
  const steel = dark('#1A1F1C', 0.6)
  const h = 38
  const legs = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
  const pts = []
  for (let i = 0; i < 4; i++) {
    const [ax, az] = legs[i]
    const [bx, bz] = legs[(i + 1) % 4]
    for (let s = 0; s < 8; s++) {
      const y0 = (s / 8) * h
      const y1 = ((s + 1) / 8) * h
      const w0 = 2.6 * (1 - (s / 8) * 0.7)
      const w1 = 2.6 * (1 - ((s + 1) / 8) * 0.7)
      pts.push(ax * w0, y0, az * w0, ax * w1, y1, az * w1)
      pts.push(ax * w0, y0, az * w0, bx * w1, y1, bz * w1)
      pts.push(bx * w0, y0, bz * w0, ax * w1, y1, az * w1)
    }
  }
  const lattice = new THREE.BufferGeometry()
  lattice.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
  g.add(new THREE.LineSegments(lattice, new THREE.LineBasicMaterial({ color: '#3A433D', fog: true })))
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2
    const p = box(0.6, 3.4, 0.25, steel, Math.cos(a) * 1.1, h - 2.5, Math.sin(a) * 1.1)
    p.rotation.y = -a
    g.add(p)
  }
  const lamp = glowSprite('#FF453A', 9, 1)
  lamp.position.set(0, h + 0.8, 0)
  g.add(lamp)
  g.position.set(x, 0, z)
  return { group: g, lamp, top: new THREE.Vector3(x, h - 1, z) }
}

/** Liniile dintre telefoane si antena: o retea care se rupe pe rand. */
function cellLinks(phones, top, count) {
  const rand = rng(5)
  const pos = []
  const seed = []
  const end = []
  for (let i = 0; i < count; i++) {
    const p = phones[Math.floor(rand() * phones.length)]
    const s = rand()
    pos.push(p.x, p.y, p.z, top.x, top.y, top.z)
    seed.push(s, s)
    end.push(0, 1)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1))
  geo.setAttribute('aEnd', new THREE.Float32BufferAttribute(end, 1))
  const mat = new THREE.ShaderMaterial({
    uniforms: { uOn: { value: 0 }, uLoss: { value: 0 }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      attribute float aEnd;
      varying float vSeed;
      varying float vEnd;
      void main() { vSeed = aSeed; vEnd = aEnd; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOn;
      uniform float uLoss;
      uniform float uTime;
      varying float vSeed;
      varying float vEnd;
      void main() {
        float broken = smoothstep(vSeed - 0.02, vSeed + 0.02, uLoss);
        float justBroke = exp(-pow((uLoss - vSeed) * 28.0, 2.0));
        float travel = fract(vEnd * 1.5 - uTime * (0.5 + vSeed) + vSeed * 7.0);
        float dash = smoothstep(0.0, 0.08, travel) * (1.0 - smoothstep(0.08, 0.16, travel));
        float flicker = 0.75 + 0.25 * sin(uTime * 22.0 + vSeed * 80.0);
        vec3 col = vec3(0.86, 0.9, 0.88) * (0.05 + 0.32 * dash) * (1.0 - broken) * mix(1.0, flicker, uLoss);
        col += vec3(1.0, 0.27, 0.23) * justBroke * 0.7;
        float fade = 1.0 - vEnd * 0.55;
        gl_FragColor = vec4(col * uOn * fade, 1.0);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const lines = new THREE.LineSegments(geo, mat)
  lines.frustumCulled = false
  return { lines, uniforms: mat.uniforms }
}

/** Ghirlande de becuri calde, ca la food court si in zona de relaxare. */
function stringLights(segments, color, perSegment, rand) {
  const pos = []
  const phase = []
  for (const [a, b] of segments) {
    for (let i = 0; i <= perSegment; i++) {
      const t = i / perSegment
      const sag = Math.sin(t * Math.PI) * 0.9
      pos.push(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag, a[2] + (b[2] - a[2]) * t)
      phase.push(rand())
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('aPhase', new THREE.Float32BufferAttribute(phase, 1))
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uDpr: { value: 1 }, uFade: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float aPhase;
      uniform float uTime, uDpr;
      varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        vA = 0.65 + 0.35 * sin(uTime * 2.0 + aPhase * 30.0);
        gl_PointSize = clamp(16.0 * uDpr / -mv.z, 1.0, 24.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uFade;
      varying float vA;
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float a = exp(-dot(p, p) * 4.0) * vA * uFade;
        gl_FragColor = vec4(uColor * a, 1.0);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const pts = new THREE.Points(geo, mat)
  pts.frustumCulled = false
  return { points: pts, uniforms: mat.uniforms }
}

function sky() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uStage: { value: 1 } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
    fragmentShader: /* glsl */ `
      uniform float uStage;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, 0.0, 1.0);
        vec3 col = mix(vec3(0.0075, 0.0092, 0.0082), vec3(0.0016, 0.002, 0.0018), pow(h, 0.55));
        vec3 toStage = normalize(vec3(0.0, 0.06, -1.0));
        float glow = pow(max(dot(vDir, toStage), 0.0), 10.0) * exp(-h * 6.0);
        col += vec3(0.012, 0.02, 0.015) * glow * uStage;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
  })
  const m = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat)
  m.renderOrder = -10
  return m
}

/** Tot ce nu sunt telefoane: scene, baruri, food truck-uri, cortul medical, intrari, antena. */
export function createSet(phones, quality) {
  const rand = rng(31)
  const group = new THREE.Group()
  const updaters = []
  group.add(sky())

  // ---- scena mare ----
  const stage = new THREE.Group()
  const black = dark('#0C0F0D')
  const truss = dark('#1E2420', 0.5)
  const sx = STAGE.x
  const depth = STAGE.front - STAGE.back
  const cz = (STAGE.front + STAGE.back) / 2
  stage.add(box(STAGE.half * 2, 1.8, depth, black, sx, 0.9, cz))
  stage.add(box(1.1, 17, 1.1, truss, sx - STAGE.half - 0.6, 8.5, STAGE.front - 1))
  stage.add(box(1.1, 17, 1.1, truss, sx + STAGE.half + 0.6, 8.5, STAGE.front - 1))
  stage.add(box(1.1, 17, 1.1, truss, sx - STAGE.half - 0.6, 8.5, STAGE.back + 0.6))
  stage.add(box(1.1, 17, 1.1, truss, sx + STAGE.half + 0.6, 8.5, STAGE.back + 0.6))
  stage.add(box(STAGE.half * 2 + 2.4, 1.2, depth, truss, sx, 17, cz))
  for (const side of [-1, 1]) {
    const pa = box(1.6, 6.5, 1.6, black, sx + side * (STAGE.half - 2.2), 10.5, STAGE.front - 0.4)
    stage.add(pa)
  }
  const led = ledWall(24, 9.6, 150)
  led.mesh.position.set(sx, 7.6, STAGE.back + 1.2)
  stage.add(led.mesh)
  const sideLeds = []
  for (const side of [-1, 1]) {
    const s = ledWall(5.4, 8.4, 34)
    s.mesh.position.set(sx + side * (STAGE.half + 4.4), 8.4, STAGE.front - 1.5)
    s.mesh.rotation.y = -side * 0.32
    stage.add(s.mesh)
    sideLeds.push(s)
  }
  stage.add(box(STAGE.half * 2 + 4, 1.1, 0.25, dark('#2A302C', 0.4), sx, 0.55, STAGE.barrier))
  // lumina din spatele scenei, ca ceata luminata
  const back = glowSprite('#9FE8B4', 44, 0.1)
  back.position.set(sx, 10, STAGE.back - 2)
  stage.add(back)
  group.add(stage)

  const beams = []
  const beamColors = ['#E9FFEF', '#D3D8B2', '#30D158', '#E9FFEF', '#D3D8B2', '#E9FFEF', '#30D158', '#D3D8B2']
  for (let i = 0; i < 8; i++) {
    if (quality.low && i % 2 === 0) continue
    const b = beam(46, 3.4, beamColors[i], beamColors[i] === '#30D158' ? 0.09 : 0.065)
    b.position.set(sx - STAGE.half + 2 + (i * (STAGE.half * 2 - 4)) / 7, 16.4, STAGE.front - 0.6)
    b.userData = { phase: rand() * Math.PI * 2, speed: 0.22 + rand() * 0.25, base: (i - 3.5) * 0.1, up: i % 2 === 0 }
    group.add(b)
    beams.push(b)
  }

  // ---- scena 2 ----
  const s2 = new THREE.Group()
  s2.add(box(6, 1.4, STAGE2.half * 2, black, STAGE2.x, 0.7, STAGE2.z))
  s2.add(box(0.8, 10, 0.8, truss, STAGE2.x - 2.5, 5, STAGE2.z - STAGE2.half - 0.4))
  s2.add(box(0.8, 10, 0.8, truss, STAGE2.x - 2.5, 5, STAGE2.z + STAGE2.half + 0.4))
  s2.add(box(6, 0.8, STAGE2.half * 2 + 1.6, truss, STAGE2.x, 10, STAGE2.z))
  const led2 = ledWall(11, 4.6, 70)
  led2.mesh.position.set(STAGE2.x + 2.4, 5.4, STAGE2.z)
  led2.mesh.rotation.y = -Math.PI / 2
  s2.add(led2.mesh)
  group.add(s2)
  for (let i = 0; i < (quality.low ? 2 : 4); i++) {
    const b = beam(32, 2.6, i % 2 ? '#D3D8B2' : '#E9FFEF', 0.06)
    b.position.set(STAGE2.x - 2.6, 9.6, STAGE2.z - STAGE2.half + 1.5 + (i * (STAGE2.half * 2 - 3)) / 3)
    b.userData = { phase: rand() * Math.PI * 2, speed: 0.3 + rand() * 0.3, base: 0, west: true }
    group.add(b)
    beams.push(b)
  }

  // ---- baruri ----
  const sageStrip = emissive('#D3D8B2', 0.85)
  const counter = dark('#141815')
  for (const [x, z, rot, len] of [[-20, 2, Math.PI / 2, 15], [20, 2, Math.PI / 2, 15], [0, 18.5, 0, 18]]) {
    const g = new THREE.Group()
    g.add(box(len, 1.15, 1.5, counter, 0, 0.58, 0))
    g.add(box(len, 0.08, 0.08, sageStrip, 0, 2.9, 0))
    g.add(box(len + 1, 0.15, 3, dark('#1A1F1C'), 0, 3.05, -0.4))
    g.position.set(x, 0, z)
    g.rotation.y = rot
    group.add(g)
  }

  // ---- food court ----
  const food = zone.food
  const warm = emissive('#FFB45A', 0.9)
  const truckMat = dark('#171B18')
  for (let i = 0; i < 4; i++) {
    for (const [z, face] of [[food.z0 + 2, 1], [food.z1 - 2, -1]]) {
      const g = new THREE.Group()
      g.add(box(5.2, 2.8, 2.4, truckMat, 0, 1.6, 0))
      g.add(box(3.6, 0.9, 0.06, warm, 0, 2.1, face * 1.22))
      g.position.set(food.x0 + 8 + i * 11, 0, z)
      group.add(g)
    }
  }
  const segs = []
  for (let i = 0; i < 6; i++) {
    const x = food.x0 + 4 + i * 7.5
    segs.push([[x, 5, food.z0 + 3], [x + 4, 5, food.z1 - 3]])
  }
  const chill = zone.chill
  for (let i = 0; i < 4; i++) segs.push([[chill.x0 + 6 + i * 9, 4, chill.z0 + 4], [chill.x0 + 10 + i * 9, 4, chill.z1 - 4]])
  const bulbs = stringLights(segs, '#FFC27A', 14, rand)
  group.add(bulbs.points)

  // ---- cortul medical ----
  const tent = new THREE.Group()
  const canvas = dark('#4C544B', 0.95)
  canvas.emissive = new THREE.Color('#141914')
  tent.add(box(6.4, 2.2, 4.8, canvas, 0, 1.1, 0))
  const roof = new THREE.Mesh(new THREE.ConeGeometry(4.5, 2, 4, 1), canvas)
  roof.rotation.y = Math.PI / 4
  roof.scale.set(1, 1, 0.76)
  roof.position.y = 3.2
  tent.add(roof)
  const sign = document.createElement('canvas')
  sign.width = sign.height = 64
  const sg = sign.getContext('2d')
  sg.fillStyle = '#1E8238'
  sg.fillRect(0, 0, 64, 64)
  sg.fillStyle = '#fff'
  sg.fillRect(26, 12, 12, 40)
  sg.fillRect(12, 26, 40, 12)
  const signTex = new THREE.CanvasTexture(sign)
  signTex.colorSpace = THREE.SRGBColorSpace
  const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: signTex, toneMapped: false }))
  signMesh.position.set(0, 1.5, 2.42)
  tent.add(signMesh)
  const tentGlow = glowSprite('#E9FFEF', 7, 0.45)
  tentGlow.position.set(0, 1.6, 2.8)
  tent.add(tentGlow)
  tent.position.set(SPOTS.tent[0], 0, SPOTS.tent[1] - 2)
  group.add(tent)

  // ---- intrarea ----
  const ent = zone.entrance
  for (const gx of [-35, -24, -13]) {
    const arch = new THREE.Group()
    arch.add(box(0.5, 5, 0.5, truss, -2.2, 2.5, 0), box(0.5, 5, 0.5, truss, 2.2, 2.5, 0), box(5, 0.6, 0.5, truss, 0, 5, 0))
    arch.add(box(4, 0.12, 0.12, emissive('#E9FFEF', 0.8), 0, 4.6, 0.3))
    arch.position.set(gx, 0, ent.z1 - 2)
    group.add(arch)
  }

  // ---- camping ----
  const tents = new THREE.InstancedMesh(new THREE.ConeGeometry(1.5, 1.6, 4), dark('#151A16'), 46)
  const dummy = new THREE.Object3D()
  const camp = zone.camping
  for (let i = 0; i < 46; i++) {
    dummy.position.set(camp.x0 + 3 + rand() * (camp.x1 - camp.x0 - 6), 0.8, camp.z0 + 3 + rand() * (camp.z1 - camp.z0 - 6))
    dummy.rotation.y = rand() * Math.PI
    dummy.scale.setScalar(0.8 + rand() * 0.5)
    dummy.updateMatrix()
    tents.setMatrixAt(i, dummy.matrix)
  }
  group.add(tents)

  // ---- punctul de intalnire ----
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 9, 8), truss)
  pole.position.set(meeting[0], 4.5, meeting[1])
  group.add(pole)
  const flagGeo = new THREE.PlaneGeometry(3.4, 2, 12, 1)
  const flagMat = new THREE.MeshStandardMaterial({ color: '#D3D8B2', emissive: '#4A5040', side: THREE.DoubleSide, roughness: 0.8 })
  const flag = new THREE.Mesh(flagGeo, flagMat)
  flag.position.set(meeting[0] + 1.7, 7.8, meeting[1])
  group.add(flag)
  const flagBase = flagGeo.attributes.position.array.slice()
  updaters.push((t) => {
    const p = flagGeo.attributes.position
    for (let i = 0; i < p.count; i++) {
      const x = flagBase[i * 3] + 1.7
      p.array[i * 3 + 2] = Math.sin(x * 1.6 - t * 3.2) * 0.22 * (x / 3.4)
    }
    p.needsUpdate = true
  })

  // ---- gardul ----
  const fence = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(bounds.x0, 1, bounds.z0), new THREE.Vector3(bounds.x1, 1, bounds.z0),
    new THREE.Vector3(bounds.x1, 1, bounds.z1), new THREE.Vector3(bounds.x0, 1, bounds.z1), new THREE.Vector3(bounds.x0, 1, bounds.z0),
  ])
  group.add(new THREE.Line(fence, new THREE.LineBasicMaterial({ color: '#27302A' })))

  // ---- antena ----
  const tw = tower(132, -122)
  group.add(tw.group)
  const cell = cellLinks(phones, tw.top, quality.low ? 90 : 170)
  group.add(cell.lines)

  return {
    group,
    led,
    sideLeds,
    led2,
    beams,
    tower: tw,
    cell,
    bulbs,
    update(t, s) {
      for (const b of beams) {
        const u = b.userData
        const sweep = Math.sin(t * u.speed + u.phase)
        // conul are varful in sursa si coboara pe -y; rotatia il intoarce spre multime sau spre cer
        if (u.west) {
          b.rotation.z = -0.62 - 0.22 * Math.sin(t * u.speed * 0.7 + u.phase)
          b.rotation.x = sweep * 0.35
        } else if (u.up) {
          b.rotation.x = -2.2 - 0.16 * Math.sin(t * u.speed * 0.8 + u.phase * 2)
          b.rotation.z = u.base * 2.2 + sweep * 0.4
        } else {
          b.rotation.x = -0.72 - 0.18 * Math.sin(t * u.speed * 0.8 + u.phase * 2)
          b.rotation.z = u.base + sweep * 0.3
        }
        b.material.uniforms.uIntensity.value = (b.userData.i0 ??= b.material.uniforms.uIntensity.value) * s.stage * (u.up ? 0.7 : 1)
      }
      led.uniforms.uTime.value = t
      led.uniforms.uBright.value = s.stage * s.led2
      for (const sl of sideLeds) sl.uniforms.uBright.value = s.stage * s.led2
      tw.lamp.material.opacity = (0.35 + 0.65 * (Math.sin(t * 3.1) > 0 ? 1 : 0.15)) * s.towerLamp
      cell.uniforms.uTime.value = t
      cell.uniforms.uOn.value = s.tower
      cell.uniforms.uLoss.value = s.loss
      bulbs.uniforms.uTime.value = t
      for (const fn of updaters) fn(t)
    },
  }
}
