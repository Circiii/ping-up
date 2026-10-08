import * as THREE from 'three'
import { WAKE_SPEED } from './crowd.js'
import grassUrl from './textures/grass.webp'
import mudUrl from './textures/mud.webp'
import { bounds, paths, STAGE, UNIT, zones } from './world.js'

// Paleta zonelor din aplicatie (Theme.kt, ZonePairs): culoarea deschisa e numele, cea plina e zona si iconitele.
const ZONE_PAIRS = [
  ['#E3E3FE', '#3838F5'], ['#DDE7FC', '#1251D3'], ['#D8E8F0', '#086DA0'], ['#CDE4CD', '#067906'],
  ['#EAE0FD', '#661AFF'], ['#F5E3FE', '#9F00F0'], ['#F6D8EC', '#B8057C'], ['#F5D7D7', '#BE0404'],
  ['#FEF5D0', '#836B01'], ['#EAE6D5', '#7D6F40'], ['#D2D2DC', '#4F4F6D'], ['#D7D7D9', '#5C5C5C'],
]
// Harta din aplicatie, noaptea (MapScreen.kt, MapPaint)
const GRASS = '#111813'
const GROUND = '#1A221C'
const ALLEY = '#2B352D'
const ALLEY_EDGE = '#232C25'
const FENCE = '#46534A'
const ACCENT = '#30D158'

// Tonul zonei dupa tip, ca in aplicatie: scena mare, barurile si punctul medical au mereu aceeasi culoare.
const TYPE_TONE = { food: 8, bar: 1, medical: 7, entrance: 10, camping: 3, chill: 2 }
const firstStage = zones.findIndex((z) => z.type === 'stage')
export function zoneTone(zn) {
  if (zn.type === 'stage') return zn.index === firstStage ? 4 : 5
  return TYPE_TONE[zn.type] ?? zn.index % ZONE_PAIRS.length
}
// Culorile punctelor utile, aceleasi ca cercurile din aplicatie.
const SPOT_TONE = { medical: 7, exit: 3, water: 2, wc: 10, info: 1, charge: 8 }

export const zoneInk = (tone) => ZONE_PAIRS[tone % ZONE_PAIRS.length][0]
export const zoneSolid = (tone) => ZONE_PAIRS[tone % ZONE_PAIRS.length][1]
export const spotColor = (type) => (type === 'meeting' ? '#FF9F0A' : zoneSolid(SPOT_TONE[type] ?? 1))

function mix(hex, base, alpha) {
  const a = parseInt(hex.slice(1), 16)
  const b = parseInt(base.slice(1), 16)
  const ch = (n, s) => (n >> s) & 255
  const c = [16, 8, 0].map((s) => Math.round(ch(a, s) * alpha + ch(b, s) * (1 - alpha)))
  return `rgb(${c.join(',')})`
}

function withAlpha(hex, alpha) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

/** Un poligon cu colturile rotunjite, ca zonele din aplicatie. */
function rounded(g, pts, r) {
  const n = pts.length
  g.beginPath()
  for (let i = 0; i < n; i++) {
    const [px, py] = pts[(i - 1 + n) % n]
    const [cx, cy] = pts[i]
    const [nx, ny] = pts[(i + 1) % n]
    const a = Math.min(r, Math.hypot(cx - px, cy - py) / 2, Math.hypot(nx - cx, ny - cy) / 2)
    const sx = cx + ((px - cx) / Math.hypot(px - cx, py - cy)) * a
    const sy = cy + ((py - cy) / Math.hypot(px - cx, py - cy)) * a
    if (i) g.lineTo(sx, sy)
    else g.moveTo(sx, sy)
    g.arcTo(cx, cy, nx, ny, a)
  }
  g.closePath()
}

const PAD = 6
/** Dreptunghiul de sol acoperit de harta si de luminile coapte. */
const RECT = { x: bounds.x0 - PAD, z: bounds.z0 - PAD, w: bounds.x1 - bounds.x0 + PAD * 2, h: bounds.z1 - bounds.z0 + PAD * 2 }

/**
 * Luminile pe care constructiile le lasa pe sol (felinare, baruri, rulote, cortul medical), coapte intr-o
 * singura imagine. Aleile se vad si ele, putin mai deschise decat iarba.
 */
function lightTexture(spots) {
  const W = 1024
  const H = Math.round((W * RECT.h) / RECT.w)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')
  const k = W / RECT.w
  g.fillStyle = '#000'
  g.fillRect(0, 0, W, H)
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.strokeStyle = '#0d120e'
  g.lineWidth = (6.5 / UNIT) * k
  for (const line of paths) {
    g.beginPath()
    line.forEach(([x, z], i) => (i ? g.lineTo((x - RECT.x) * k, (z - RECT.z) * k) : g.moveTo((x - RECT.x) * k, (z - RECT.z) * k)))
    g.stroke()
  }
  g.globalCompositeOperation = 'lighter'
  for (const s of spots) {
    const u = (s.x - RECT.x) * k
    const v = (s.z - RECT.z) * k
    const r = s.r * k
    const grad = g.createRadialGradient(u, v, 0, u, v, r)
    grad.addColorStop(0, withAlpha(s.color, s.a))
    grad.addColorStop(0.45, withAlpha(s.color, s.a * 0.34))
    grad.addColorStop(1, withAlpha(s.color, 0))
    g.fillStyle = grad
    g.fillRect(u - r, v - r, r * 2, r * 2)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.flipY = false
  return tex
}

/**
 * Unde e iarba calcata pana la pamant: pe alei, in fata scenelor, la baruri, la mancare si la intrare.
 * Campingul si zona de relaxare raman mai verzi.
 */
const WEAR = { stage: 0.95, food: 0.8, bar: 0.85, entrance: 0.9, medical: 0.55, camping: 0.25, chill: 0.3 }
function wearTexture() {
  const W = 512
  const H = Math.round((W * RECT.h) / RECT.w)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')
  const k = W / RECT.w
  const px = ([x, z]) => [(x - RECT.x) * k, (z - RECT.z) * k]
  g.fillStyle = '#000'
  g.fillRect(0, 0, W, H)
  // marginile moi vin din umbra desenului: merge in orice browser, spre deosebire de filtrul de blur
  g.shadowColor = '#fff'
  g.shadowBlur = 9
  for (const zn of zones) {
    const a = WEAR[zn.type] ?? 0.6
    g.fillStyle = `rgba(255,255,255,${a})`
    g.beginPath()
    zn.pts.map(px).forEach(([u, v], i) => (i ? g.lineTo(u, v) : g.moveTo(u, v)))
    g.closePath()
    g.fill()
  }
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.strokeStyle = '#fff'
  g.lineWidth = (8 / UNIT) * k
  for (const line of paths) {
    g.beginPath()
    line.map(px).forEach(([u, v], i) => (i ? g.lineTo(u, v) : g.moveTo(u, v)))
    g.stroke()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.flipY = false
  return tex
}

/** Harta desenata ca in aplicatie, pe o panza care se aseaza peste sol. */
function mapTexture() {
  const rect = RECT
  const W = 2048
  const H = Math.round((W * rect.h) / rect.w)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')
  const k = W / rect.w
  const px = ([x, z]) => [(x - rect.x) * k, (z - rect.z) * k]
  const meters = (m) => (m / UNIT) * k

  // in afara incintei, iarba; inauntru, pamantul batut, cu gardul punctat
  g.fillStyle = withAlpha(GRASS, 0.92)
  g.fillRect(0, 0, W, H)
  const site = [[bounds.x0, bounds.z0], [bounds.x1, bounds.z0], [bounds.x1, bounds.z1], [bounds.x0, bounds.z1]].map(px)
  rounded(g, site, meters(12))
  g.fillStyle = GROUND
  g.fill()
  g.setLineDash([meters(5), meters(4)])
  g.lineWidth = meters(1.2)
  g.strokeStyle = FENCE
  g.stroke()
  g.setLineDash([])

  // aleile stau sub zone: se vad in spatiile dintre ele
  g.lineCap = 'round'
  g.lineJoin = 'round'
  for (const line of paths) {
    g.beginPath()
    line.map(px).forEach(([u, v], i) => (i ? g.lineTo(u, v) : g.moveTo(u, v)))
    g.lineWidth = meters(7) + meters(2)
    g.strokeStyle = ALLEY_EDGE
    g.stroke()
    g.lineWidth = meters(7)
    g.strokeStyle = ALLEY
    g.stroke()
  }

  for (const zn of zones) {
    const tone = zoneTone(zn)
    const solid = zoneSolid(tone)
    const pts = zn.pts.map(px)
    const ys = pts.map((p) => p[1])
    rounded(g, pts.map(([u, v]) => [u, v + meters(2)]), meters(6))
    g.fillStyle = 'rgba(0,0,0,.35)'
    g.fill()
    rounded(g, pts, meters(6))
    const grad = g.createLinearGradient(0, Math.min(...ys), 0, Math.max(...ys))
    grad.addColorStop(0, mix(solid, GROUND, 0.48))
    grad.addColorStop(1, mix(solid, GROUND, 0.3))
    g.fillStyle = grad
    g.fill()
    g.lineWidth = meters(1.4)
    g.strokeStyle = withAlpha(zoneInk(tone), 0.5)
    g.stroke()
    if (zn.id === 'main-stage') {
      g.lineWidth = meters(7)
      g.strokeStyle = withAlpha(ACCENT, 0.28)
      g.stroke()
      g.lineWidth = meters(2.4)
      g.strokeStyle = ACCENT
      g.stroke()
    }
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.flipY = false
  tex.anisotropy = 4
  return { tex, rect }
}

export function createGround(spots) {
  const map = mapTexture()
  const lights = lightTexture(spots)
  // iarba si pamantul batut (Poly Haven, CC0); pana vin, solul are un ton mediu
  const loader = new THREE.TextureLoader()
  const surface = (url) => {
    const tex = loader.load(url, () => {
      if (++loaded === 2) uniforms.uTex.value = 1
    })
    tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.anisotropy = 8
    return tex
  }
  let loaded = 0
  const uniforms = {
    uGrass: { value: surface(grassUrl) },
    uMud: { value: surface(mudUrl) },
    uWear: { value: wearTexture() },
    uTex: { value: 0 },
    uLightTex: { value: lights },
    uLights: { value: 1 },
    uStageCol: { value: new THREE.Color('#EAF6EC') },
    uTime: { value: 0 },
    uPin: { value: new THREE.Vector2() },
    uSpot: { value: 1 },
    uStage: { value: 1 },
    uRing: { value: [new THREE.Vector4(0, 0, -99, 0), new THREE.Vector4(0, 0, -99, 0), new THREE.Vector4(0, 0, -99, 0)] },
    uRingSpeed: { value: 15 },
    uMap: { value: 0 },
    uMapTex: { value: map.tex },
    uMapRect: { value: new THREE.Vector4(map.rect.x, map.rect.z, map.rect.w, map.rect.h) },
    uStageZ: { value: STAGE.front },
    uFogColor: { value: new THREE.Color('#0E110F') },
    uFogDensity: { value: 0.0042 },
    uHold: { value: new THREE.Vector4(0, 0, 0, 0) },
    uWake: { value: new THREE.Vector3(0, 0, 1e6) },
  }
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying float vDist;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vec4 mv = viewMatrix * w;
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime, uSpot, uStage, uRingSpeed, uMap, uStageZ, uFogDensity, uLights, uTex;
      uniform sampler2D uLightTex, uGrass, uMud, uWear;
      uniform vec3 uStageCol;
      uniform vec3 uWake;
      uniform vec2 uPin;
      uniform vec4 uRing[3];
      uniform vec4 uHold;
      uniform sampler2D uMapTex;
      uniform vec4 uMapRect;
      uniform vec3 uFogColor;
      varying vec3 vWorld;
      varying float vDist;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }

      void main() {
        vec2 p = vWorld.xz;
        vec2 muv = (p - uMapRect.xy) / uMapRect.zw;
        bool onMap = muv.x > 0.0 && muv.x < 1.0 && muv.y > 0.0 && muv.y < 1.0;

        // solul: iarba, iar unde calca lumea, pamant batut; doua scari ca sa nu se vada repetarea
        vec3 g1 = texture2D(uGrass, p * 0.31).rgb;
        vec3 g2 = texture2D(uGrass, p * 0.067 + 0.37).rgb;
        vec3 grass = mix(g1, g2, 0.35);
        vec3 mud = texture2D(uMud, p * 0.26).rgb;
        float wear = onMap ? texture2D(uWear, muv).r : 0.0;
        wear = clamp(wear + (noise(p * 0.32) - 0.5) * 0.55, 0.0, 1.0);
        float bare = smoothstep(0.3, 0.8, wear);
        vec3 albedo = mix(grass, mud, bare);
        // departe, detaliul se topeste in tonul mediu: fara sclipiri si fara model repetat
        float far = smoothstep(45.0, 150.0, vDist);
        albedo = mix(albedo, vec3(0.1, 0.09, 0.062), far);
        albedo = mix(vec3(0.1, 0.09, 0.062), albedo, uTex);

        // relieful vine din textura: luminozitatea e inaltimea
        float h = dot(mix(g1, mud, bare), vec3(0.3, 0.59, 0.11)) * (1.0 - far) * uTex;
        vec3 sx = dFdx(vWorld);
        vec3 sy = dFdy(vWorld);
        vec3 up = vec3(0.0, 1.0, 0.0);
        vec3 r1 = cross(sy, up);
        vec3 r2 = cross(up, sx);
        float det = dot(sx, r1);
        vec3 N = normalize(abs(det) * up - sign(det) * (dFdx(h) * r1 + dFdy(h) * r2) * 1.8);

        // lumina cade pe sol: cerul de noapte, scena din fata, felinarele, reflectorul pinului
        vec3 light = vec3(0.0052, 0.0068, 0.0058) * (0.75 + 0.5 * noise(p * 0.9) * noise(p * 0.13 + 3.0));
        vec2 w = vec2(p.x / 34.0, (p.y - uStageZ - 14.0) / 24.0);
        float wash = exp(-dot(w, w));
        vec3 toStage = normalize(vec3(-p.x * 0.02, 0.55, uStageZ - p.y));
        light += uStageCol * 0.034 * wash * uStage * (0.35 + 1.1 * max(dot(N, toStage), 0.0));
        if (onMap) light += texture2D(uLightTex, muv).rgb * 0.34 * uLights * (0.6 + 0.4 * N.y);
        float dp = length(p - uPin);
        vec3 toPin = normalize(vec3(uPin.x + 3.0 - p.x, 24.0, uPin.y + 7.0 - p.y));
        float pinLit = 0.45 + 0.75 * max(dot(N, toPin), 0.0);
        light += vec3(0.11, 0.135, 0.115) * exp(-dp * dp / 9.0) * uSpot * pinLit;
        light += vec3(0.02, 0.03, 0.024) * exp(-dp * dp / 90.0) * uSpot * pinLit;
        vec3 col = albedo * light * 6.0;

        float ring = 0.0;
        for (int i = 0; i < 3; i++) {
          vec4 r = uRing[i];
          float age = uTime - r.z;
          if (age > 0.0 && age < 3.4) {
            float d = length(p - r.xy) - age * uRingSpeed;
            ring += r.w * exp(-d * d / (0.5 + age * 0.8)) * (1.0 - age / 3.4);
          }
        }
        col += vec3(0.11, 0.6, 0.24) * ring * 0.55;

        // primul ping, cel care trezeste telefoanele: un front lat si rapid
        float wakeAge = uTime - uWake.z;
        if (wakeAge > 0.0 && wakeAge < 6.0) {
          float dw = length(p - uWake.xy) - wakeAge * ${WAKE_SPEED.toFixed(1)};
          col += vec3(0.11, 0.6, 0.24) * exp(-dw * dw / 14.0) * (1.0 - wakeAge / 6.0) * 0.5;
        }

        float dh = length(p - uHold.xy);
        float wave = fract(uTime * 0.6 - dh / 9.0);
        float rings = smoothstep(0.0, 0.08, wave) * (1.0 - smoothstep(0.08, 0.22, wave));
        float area = exp(-dh * dh / (uHold.z * uHold.z + 0.01));
        col += vec3(0.6, 0.33, 0.02) * uHold.w * (area * 0.25 + rings * exp(-dh / 5.5) * 0.7);

        if (uMap > 0.0 && onMap) {
          vec4 m = texture2D(uMapTex, muv);
          col = mix(col, m.rgb, m.a * uMap);
        }

        float fog = 1.0 - exp(-uFogDensity * uFogDensity * vDist * vDist);
        col = mix(col, uFogColor, fog * (1.0 - 0.6 * uMap));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), mat)
  mesh.rotation.x = -Math.PI / 2
  return { mesh, uniforms, lights, rect: RECT }
}
