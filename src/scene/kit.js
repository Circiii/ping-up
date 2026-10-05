// Piesele din care sunt construite modelele: materiale, grinzi cu zabrele, fascicule, ecrane LED, ghirlande.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

export const metal = (hex, rough = 0.5) => new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: 0.6, envMapIntensity: 0.7 })
export const matte = (hex, rough = 0.92) => new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: 0, envMapIntensity: 0.15 })
/** Suprafata care lumineaza singura: peste 1 intra in stralucirea din post-procesare. */
export const lit = (hex, k = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), toneMapped: false })

const KEEP = new Set(['position', 'normal', 'uv'])

/** Aduce o geometrie la forma comuna (fara index; pozitie, normala, uv), o roteste (x, y, z) si o muta. */
export function place(geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo
  for (const name of Object.keys(g.attributes)) if (!KEEP.has(name)) g.deleteAttribute(name)
  if (rx) g.rotateX(rx)
  if (ry) g.rotateY(ry)
  if (rz) g.rotateZ(rz)
  if (x || y || z) g.translate(x, y, z)
  return g
}

export const box = (w, h, d, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => place(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz)
export const merge = (parts) => mergeGeometries(parts, false)

/** O bara intre doua puncte. */
export function strut(a, b, r = 0.05, sides = 5) {
  const dir = new THREE.Vector3().subVectors(b, a)
  const len = dir.length()
  const g = place(new THREE.CylinderGeometry(r, r, len, sides, 1, true), 0, len / 2, 0)
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()))
  g.translate(a.x, a.y, a.z)
  return g
}

/** Aduna geometrii pe materiale si scoate cate o plasa pentru fiecare material. */
export class Batch {
  constructor() {
    this.parts = new Map()
  }
  add(material, ...geos) {
    if (!this.parts.has(material)) this.parts.set(material, [])
    this.parts.get(material).push(...geos)
    return this
  }
  build(group = new THREE.Group()) {
    for (const [material, geos] of this.parts) group.add(new THREE.Mesh(merge(geos), material))
    return group
  }
}

/**
 * Grinda cu zabrele, ca la scenele de concert: patru tevi lungi si diagonale in zigzag pe fiecare fata.
 * Creste pe +Y de la 0 la `len`; `size` e latura sectiunii.
 */
export function truss(len, size = 1) {
  const t = size * 0.1
  const h = size / 2
  const parts = []
  for (const [x, z] of [[-h, -h], [h, -h], [h, h], [-h, h]]) parts.push(box(t, len, t, x, len / 2, z))
  const bays = Math.max(1, Math.round(len / size))
  const bay = len / bays
  const diag = Math.hypot(size, bay)
  const lean = Math.atan2(size, bay)
  for (let i = 0; i < bays; i++) {
    const y = (i + 0.5) * bay
    const s = i % 2 ? 1 : -1
    for (const z of [-h, h]) parts.push(box(t * 0.75, diag, t * 0.75, 0, y, z, 0, 0, s * lean))
    for (const x of [-h, h]) parts.push(box(t * 0.75, diag, t * 0.75, x, y, 0, s * lean, 0, 0))
  }
  return merge(parts)
}

/** Aceeasi grinda, culcata intre doua puncte. */
export function trussBetween(a, b, size = 1) {
  const dir = new THREE.Vector3().subVectors(b, a)
  const g = truss(dir.length(), size)
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()))
  g.translate(a.x, a.y, a.z)
  return g
}

let glowTexture
/** Un sprite moale, pentru lumini care doar stralucesc. */
export function glow(color, size, opacity = 1) {
  if (!glowTexture) {
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const g = c.getContext('2d')
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(0.22, 'rgba(255,255,255,.42)')
    grad.addColorStop(0.55, 'rgba(255,255,255,.1)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 128, 128)
    glowTexture = new THREE.CanvasTexture(c)
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }))
  s.scale.set(size, size, 1)
  return s
}

/**
 * Fasciculul unui reflector prin ceata: un trunchi de con cu varful in sursa (originea), care coboara pe -Y.
 * E mai aprins la sursa si in mijloc, iar praful din aer ii da dungi care se misca incet.
 */
export function beam(length, r0, r1, color, time) {
  const geo = new THREE.CylinderGeometry(r0, r1, length, 28, 1, true)
  geo.translate(0, -length / 2, 0)
  const material = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uIntensity: { value: 0 }, uTime: time, uSeed: { value: Math.random() * 10 } },
    vertexShader: /* glsl */ `
      varying float vH;
      varying float vAng;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vH = uv.y;
        vAng = atan(position.z, position.x);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vV = normalize(-mv.xyz);
        vN = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity, uTime, uSeed;
      varying float vH;
      varying float vAng;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float facing = abs(dot(normalize(vN), normalize(vV)));
        float dust = 0.78 + 0.22 * sin(vAng * 7.0 + uSeed + uTime * 0.6) * sin(vH * 11.0 - uTime * 0.9 + uSeed);
        float a = pow(facing, 1.9) * pow(clamp(vH, 0.0, 1.0), 1.35) * dust * uIntensity;
        gl_FragColor = vec4(uColor * a, 1.0);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(geo, material)
  mesh.frustumCulled = false
  return mesh
}

const DOWN = new THREE.Vector3(0, -1, 0)
const aimTo = new THREE.Vector3()
/** Intoarce un fascicul: `pan` in jurul verticalei (0 = spre +Z), `tilt` de la 0 (in jos) la PI (in sus). */
export function aim(mesh, pan, tilt) {
  aimTo.set(Math.sin(pan) * Math.sin(tilt), -Math.cos(tilt), Math.cos(pan) * Math.sin(tilt))
  mesh.quaternion.setFromUnitVectors(DOWN, aimTo)
}

/**
 * Linii groase care se pot muta in fiecare cadru (laserele, predarea raportului). Fiecare linie e un dreptunghi
 * intins pe ecran intre doua puncte, mai aprins la capatul de unde pleaca.
 */
export function ribbons(count, color, width = 1.4) {
  const geo = new THREE.InstancedBufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0]), 3))
  geo.setIndex([0, 1, 2, 0, 2, 3])
  const a = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage)
  const b = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage)
  const k = new THREE.InstancedBufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage)
  geo.setAttribute('aA', a)
  geo.setAttribute('aB', b)
  geo.setAttribute('aK', k)
  geo.instanceCount = count
  const material = new THREE.ShaderMaterial({
    uniforms: { uView: { value: new THREE.Vector2(1, 1) }, uDpr: { value: 1 }, uWidth: { value: width }, uColor: { value: new THREE.Color(color) }, uTail: { value: 0.12 } },
    vertexShader: /* glsl */ `
      attribute vec3 aA;
      attribute vec3 aB;
      attribute float aK;
      uniform vec2 uView;
      uniform float uWidth, uDpr;
      varying float vS;
      varying float vAcross;
      varying float vK;
      void main() {
        vec4 ca = projectionMatrix * modelViewMatrix * vec4(aA, 1.0);
        vec4 cb = projectionMatrix * modelViewMatrix * vec4(aB, 1.0);
        if (aK <= 0.0 || ca.w < 0.2 || cb.w < 0.2) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
        vec2 sa = ca.xy / ca.w * uView;
        vec2 sb = cb.xy / cb.w * uView;
        vec2 dir = normalize(sb - sa + vec2(1e-5));
        vec4 c = mix(ca, cb, position.x);
        c.xy += vec2(-dir.y, dir.x) * position.y * uWidth * uDpr / uView * c.w;
        gl_Position = c;
        vS = position.x;
        vAcross = position.y;
        vK = aK;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uTail;
      varying float vS;
      varying float vAcross;
      varying float vK;
      void main() {
        float soft = smoothstep(0.0, 0.85, 1.0 - abs(vAcross));
        float along = mix(1.0, uTail, smoothstep(0.0, 1.0, vS));
        gl_FragColor = vec4(uColor * soft * along * vK, 1.0);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const mesh = new THREE.Mesh(geo, material)
  mesh.frustumCulled = false
  return {
    mesh,
    uniforms: material.uniforms,
    set(i, ax, ay, az, bx, by, bz, intensity) {
      a.setXYZ(i, ax, ay, az)
      b.setXYZ(i, bx, by, bz)
      k.setX(i, intensity)
    },
    commit() {
      a.needsUpdate = true
      b.needsUpdate = true
      k.needsUpdate = true
    },
  }
}

/**
 * Ecran LED: o retea de becuri care arata ce scrie pe o panza, peste inelele de ping care pleaca din centru.
 * Cand semnalul cade, imaginea se rupe pe orizontala si bucati de ecran se sting.
 */
export function ledWall(width, height, cols, time) {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = Math.max(64, Math.round((1024 * height) / width))
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  const rows = Math.round((cols * height) / width)
  const uniforms = {
    uTex: { value: tex },
    uCells: { value: new THREE.Vector2(cols, rows) },
    uBright: { value: 1 },
    uTime: time,
    uBeat: { value: 0 },
    uGlitch: { value: 0 },
    uRings: { value: 1 },
    uEq: { value: 0 },
    uTint: { value: new THREE.Color('#30D158') },
  }
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform sampler2D uTex;
      uniform vec2 uCells;
      uniform float uBright, uTime, uBeat, uGlitch, uRings, uEq;
      uniform vec3 uTint;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec2 uv = vUv;
        float band = floor(uv.y * 12.0);
        float tear = step(0.8, hash(vec2(band, floor(uTime * 8.0)))) * uGlitch;
        uv.x += (hash(vec2(band, floor(uTime * 11.0))) - 0.5) * 0.16 * tear;
        vec2 g = uv * uCells;
        vec2 cell = floor(g);
        vec2 c = (cell + 0.5) / uCells;
        vec3 t = texture2D(uTex, c).rgb;

        vec2 q = (c - 0.5) * vec2(uCells.x / uCells.y, 1.0);
        float d = length(q);
        float rings = pow(max(0.0, sin(d * 22.0 - uBeat * 3.14159)), 8.0) * exp(-d * 1.7);
        vec3 col = t + uTint * rings * 0.34 * uRings * (1.0 - uGlitch);

        // egalizator: coloane care urca si coboara pe ritm
        float level = 0.18 + 0.78 * hash(vec2(floor(c.x * uCells.x * 0.5), floor(uBeat * 2.0)));
        col += uTint * step(c.y, level) * (0.3 + 0.7 * c.y) * uEq;

        float snow = hash(cell + floor(uTime * 24.0)) * uGlitch;
        float dead = step(0.9, hash(vec2(floor(c.x * 6.0), floor(c.y * 4.0)) + floor(uTime * 4.0))) * uGlitch;
        col = (col + vec3(0.2, 0.05, 0.05) * snow) * (1.0 - dead);

        float led = 1.0 - smoothstep(0.24, 0.44, length(fract(g) - 0.5));
        col = col * led * 1.7 * uBright + vec3(0.01, 0.014, 0.011) * led;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
    toneMapped: false,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material)
  const ctx = canvas.getContext('2d')
  let current = null
  /** Deseneaza textul ecranului: o lista de [text, culoare, marime (parte din inaltime), y (parte din inaltime)]. */
  function show(key, lines) {
    if (key === current) return
    current = key
    const W = canvas.width
    const H = canvas.height
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, W, H)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const [text, color, size, y = 0.5] of lines) {
      ctx.fillStyle = color
      ctx.font = `800 ${Math.round(size * H)}px Inter, system-ui, sans-serif`
      ctx.fillText(text, W / 2, y * H, W * 0.94)
    }
    tex.needsUpdate = true
  }
  return { mesh, show, uniforms }
}

/** Ghirlande de becuri calde intinse intre doua puncte, cu burta la mijloc. */
export function stringLights(segments, color, perSegment, rand, time) {
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
  return lightPoints(pos, phase, color, 15, time)
}

/** Puncte de lumina care palpaie usor: becuri, felinare, lumini de pe turnuri. */
export function lightPoints(pos, phase, color, size, time) {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('aPhase', new THREE.Float32BufferAttribute(phase, 1))
  const uniforms = { uTime: time, uColor: { value: new THREE.Color(color) }, uDpr: { value: 1 }, uSize: { value: size }, uFade: { value: 1 } }
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute float aPhase;
      uniform float uTime, uDpr, uSize;
      varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        vA = 0.72 + 0.28 * sin(uTime * 1.7 + aPhase * 30.0);
        gl_PointSize = clamp(uSize * uDpr / -mv.z * 8.0, 1.5 * uDpr, uSize * 1.6 * uDpr);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uFade;
      varying float vA;
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float a = exp(-dot(p, p) * 4.0) * vA * uFade;
        gl_FragColor = vec4(uColor * a * 1.4, 1.0);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const points = new THREE.Points(geo, material)
  points.frustumCulled = false
  return { points, uniforms }
}
