import * as THREE from 'three'
import { bounds, STAGE, zones } from './world.js'

// Culorile zonelor din aplicatie (Theme.kt, ZonePairs), in ordinea din venue.json:
// noaptea, zona e culoarea inchisa la 34% peste celula, iar numele e culoarea deschisa.
const ZONE_PAIRS = [
  ['#E3E3FE', '#3838F5'], ['#DDE7FC', '#1251D3'], ['#D8E8F0', '#086DA0'], ['#CDE4CD', '#067906'],
  ['#EAE0FD', '#661AFF'], ['#F5E3FE', '#9F00F0'], ['#F6D8EC', '#B8057C'], ['#F5D7D7', '#BE0404'],
  ['#FEF5D0', '#836B01'], ['#EAE6D5', '#7D6F40'], ['#D2D2DC', '#4F4F6D'], ['#D7D7D9', '#5C5C5C'],
]
const CELL = [0x1c, 0x21, 0x1d]

function over(hex, alpha) {
  const n = parseInt(hex.slice(1), 16)
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  return `rgb(${c.map((v, i) => Math.round(v * alpha + CELL[i] * (1 - alpha))).join(',')})`
}

export const zoneInk = (index) => ZONE_PAIRS[index % ZONE_PAIRS.length][0]

/** Harta desenata ca in aplicatie, pe o panza care se aseaza peste sol. */
function mapTexture() {
  const pad = 6
  const rect = { x: bounds.x0 - pad, z: bounds.z0 - pad, w: bounds.x1 - bounds.x0 + pad * 2, h: bounds.z1 - bounds.z0 + pad * 2 }
  const W = 2048
  const H = Math.round((W * rect.h) / rect.w)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')
  const px = (x, z) => [((x - rect.x) / rect.w) * W, ((z - rect.z) / rect.h) * H]
  g.fillStyle = 'rgba(14,17,15,0.94)'
  g.fillRect(0, 0, W, H)
  const k = W / rect.w
  g.lineJoin = 'round'
  for (const zn of zones) {
    g.beginPath()
    zn.pts.forEach(([x, z], i) => {
      const [u, v] = px(x, z)
      if (i) g.lineTo(u, v)
      else g.moveTo(u, v)
    })
    g.closePath()
    g.fillStyle = over(ZONE_PAIRS[zn.index % ZONE_PAIRS.length][1], 0.34)
    g.fill()
    g.lineWidth = 0.9 * k
    g.strokeStyle = '#1C211D'
    g.stroke()
    if (zn.id === 'main-stage') {
      g.lineWidth = 1.2 * k
      g.strokeStyle = '#30D158'
      g.stroke()
    }
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.flipY = false
  tex.anisotropy = 4
  return { tex, rect }
}

export function createGround() {
  const map = mapTexture()
  const uniforms = {
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
      uniform float uTime, uSpot, uStage, uRingSpeed, uMap, uStageZ, uFogDensity;
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
        vec3 col = vec3(0.0052, 0.0068, 0.0058);
        col *= 0.75 + 0.5 * noise(p * 0.9) * noise(p * 0.13 + 3.0);

        float wash = exp(-pow(p.x / 34.0, 2.0) - pow((p.y - uStageZ - 16.0) / 26.0, 2.0));
        col += vec3(0.022, 0.034, 0.027) * wash * uStage;

        float dp = length(p - uPin);
        col += vec3(0.11, 0.135, 0.115) * exp(-dp * dp / 9.0) * uSpot;
        col += vec3(0.02, 0.03, 0.024) * exp(-dp * dp / 90.0) * uSpot;

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

        float dh = length(p - uHold.xy);
        float wave = fract(uTime * 0.6 - dh / 9.0);
        float rings = smoothstep(0.0, 0.08, wave) * (1.0 - smoothstep(0.08, 0.22, wave));
        float area = exp(-dh * dh / (uHold.z * uHold.z + 0.01));
        col += vec3(0.6, 0.33, 0.02) * uHold.w * (area * 0.25 + rings * exp(-dh / 5.5) * 0.7);

        vec2 muv = (p - uMapRect.xy) / uMapRect.zw;
        if (uMap > 0.0 && muv.x > 0.0 && muv.x < 1.0 && muv.y > 0.0 && muv.y < 1.0) {
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
  return { mesh, uniforms }
}
