// Oamenii din multime: siluete in contralumina, cu telefonul ridicat. Lumina fiecarui telefon e ecranul din mana cuiva.
import * as THREE from 'three'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { merge, place } from './kit.js'

/** Unde e telefonul fata de talpi, intr-un om de inaltime 1: dreapta, sus, in fata. */
const HAND = [0.17, 1.13, 0.14]
/** Telefonul e aplecat spre cel care il tine. */
const TILT = -0.2
const PHONE = [0.06, 0.118, 0.01]

function tag(geo, part) {
  geo.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count).fill(part), 1))
  return geo
}

function limb(a, b, r0, r1, sides) {
  const dir = new THREE.Vector3().subVectors(b, a)
  const len = dir.length()
  const g = place(new THREE.CylinderGeometry(r1, r0, len, sides, 1, true), 0, len / 2, 0)
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()))
  g.translate(a.x, a.y, a.z)
  return g
}

/** Omul priveste spre +Z. Parti: 0 trunchi, 1 cap, 2 brate, 3 telefon, 4 picioare. */
export function personGeometry(detail = 1) {
  const sides = detail ? 8 : 5
  const thin = detail ? 5 : 3
  const V = (x, y, z) => new THREE.Vector3(x, y, z)
  // solduri, talie, umeri, gat; pe telefoanele modeste, aceeasi silueta din mai putine trepte
  const profile = detail
    ? [[0, 0.44], [0.1, 0.45], [0.112, 0.52], [0.098, 0.6], [0.125, 0.7], [0.142, 0.765], [0.105, 0.81], [0.046, 0.835], [0.04, 0.875]]
    : [[0, 0.44], [0.108, 0.47], [0.1, 0.6], [0.142, 0.76], [0.046, 0.835], [0.04, 0.875]]
  const torso = place(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), sides))
  torso.scale(1, 1, 0.64)
  const legs = [-1, 1].map((s) => limb(V(s * 0.052, 0, 0), V(s * 0.058, 0.47, 0), 0.04, 0.062, thin))
  const head = place(new THREE.SphereGeometry(0.094, detail ? 9 : 6, detail ? 7 : 4))
  head.scale(1, 1.14, 1.04)
  head.translate(0, 0.955, 0)
  // bratul cu telefonul: umar, cot, mana
  const elbow = V(0.205, 0.9, 0.09)
  const arms = [
    limb(V(0.14, 0.75, 0), elbow, 0.036, 0.031, thin),
    limb(elbow, V(HAND[0], HAND[1] - 0.055, HAND[2] - 0.012), 0.031, 0.026, thin),
    limb(V(-0.145, 0.75, 0), V(-0.165, 0.43, 0.03), 0.036, 0.028, thin),
  ]
  const phone = place(new THREE.BoxGeometry(...PHONE), HAND[0], HAND[1], HAND[2], TILT)
  return merge([tag(torso, 0), ...legs.map((g) => tag(g, 4)), tag(head, 1), ...arms.map((g) => tag(g, 2)), tag(phone, 3)])
}

/**
 * Saritura pe ritm, aceeasi pentru om, pentru lumina telefonului si pentru capetele legaturilor:
 * un val care pleaca de la scena, cu un mic decalaj pentru fiecare.
 */
export const BOUNCE = /* glsl */ `
  uniform float uBeat, uBob;
  uniform vec2 uStageXZ;
  float bounce(float seed, float energy, vec2 xz) {
    float ph = uBeat + seed * 0.37 - length(xz - uStageXZ) * 0.006;
    float s = abs(sin(3.14159265 * ph));
    return energy * uBob * s * s * 0.085;
  }
`
export function bounceAt(p, beat, bob, stage) {
  const ph = beat + p.seed * 0.37 - Math.hypot(p.x - stage[0], p.z - stage[1]) * 0.006
  const s = Math.abs(Math.sin(Math.PI * ph))
  return p.energy * bob * s * s * 0.085
}

/** Cat de aprins e ecranul unui telefon si in ce culoare: aceeasi socoteala ca la luminile din multime. */
const vertex = (wakeSpeed) => /* glsl */ `
  attribute vec3 aPos;
  attribute vec4 aWho;
  attribute float aPart;
  uniform float uShow, uTime, uCrowd, uDim, uMesh, uReveal;
  uniform vec3 uWake;
  uniform vec2 uPin;
  uniform sampler2D uLightTex;
  uniform vec4 uLightRect;
  varying vec3 vN;
  varying vec3 vW;
  varying vec3 vLocal;
  varying vec3 vScreen;
  varying vec2 vFace;
  varying float vPart;
  varying float vSeed;
  varying float vDist;
  varying float vPlain;
  ${BOUNCE}
  void main() {
    float s = aPos.y / ${HAND[1].toFixed(3)} * uShow;
    float c = cos(aWho.z);
    float sn = sin(aWho.z);
    vec3 p = position;
    // se leagana pe ritm, din umeri
    p.x += sin(uBeat * 3.14159265 + aWho.x * 6.2832) * 0.03 * aWho.y * uBob * position.y;
    p -= vec3(${HAND[0].toFixed(3)}, 0.0, ${HAND[2].toFixed(3)});
    p *= s;
    vec3 world = vec3(aPos.x + c * p.x + sn * p.z, p.y + bounce(aWho.x, aWho.y, aPos.xz), aPos.z - sn * p.x + c * p.z);
    vN = normalize(vec3(c * normal.x + sn * normal.z, normal.y, -sn * normal.x + c * normal.z));
    vW = world;
    vPart = aPart;
    vSeed = aWho.x;
    vLocal = texture2D(uLightTex, (aPos.xz - uLightRect.xy) / uLightRect.zw).rgb;

    // ecranul e fata telefonului dinspre om
    vec3 q = position - vec3(${HAND.map((v) => v.toFixed(3)).join(', ')});
    vFace = aPart > 2.5 && aPart < 3.5 && normal.z < -0.9 ? vec2(q.x / ${(PHONE[0] / 2).toFixed(4)}, q.y / ${((PHONE[1] / 2) * Math.cos(TILT)).toFixed(4)}) : vec2(9.0);
    float tw = 0.7 + 0.3 * sin(uTime * (0.6 + fract(aWho.x * 7.13) * 2.1) + aWho.x * 37.0);
    float lowered = smoothstep(0.9, 1.0, sin(uTime * 0.17 + aWho.x * 91.0));
    float app = min(aWho.w, 1.0);
    float away = length(aPos.xz - uPin);
    float rev = uMesh * app * smoothstep(away + 2.0, away - 1.0, uReveal);
    float wake = clamp((uTime - uWake.z - length(aPos.xz - uWake.xy) / ${wakeSpeed.toFixed(1)}) / 0.5, 0.0, 1.0);
    float on = uCrowd * (0.55 + 0.45 * tw) * (1.0 - 0.85 * lowered) * (1.0 - uDim * (1.0 - app) * 0.4) * (0.05 + 0.95 * wake);
    vec3 glass = mix(vec3(0.62, 0.72, 0.84), vec3(0.19, 0.82, 0.35), rev);
    // trecatorul duce raportul: ecranul lui e portocaliu
    if (aWho.w > 1.5) { glass = vec3(1.0, 0.62, 0.04); on = 1.0; rev = 1.0; }
    vScreen = glass * mix(on, max(on, 0.9), rev) * 2.1;
    vPlain = rev;

    vec4 mv = viewMatrix * vec4(world, 1.0);
    vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const fragment = /* glsl */ `
  uniform vec3 uFogColor, uStageCol, uGlowCol;
  uniform float uFogDensity, uStage, uSpot;
  uniform vec2 uStageXZ, uPin;
  uniform vec3 uStage2;
  uniform vec4 uGlow;
  varying vec3 vN;
  varying vec3 vW;
  varying vec3 vLocal;
  varying vec3 vScreen;
  varying vec2 vFace;
  varying float vPart;
  varying float vSeed;
  varying float vDist;
  varying float vPlain;

  vec3 cloth(float s) {
    float k = floor(fract(s * 13.7) * 6.0);
    if (k < 1.0) return vec3(0.03, 0.042, 0.035);
    if (k < 2.0) return vec3(0.13, 0.14, 0.1);
    if (k < 3.0) return vec3(0.022, 0.07, 0.044);
    if (k < 4.0) return vec3(0.085, 0.07, 0.045);
    if (k < 5.0) return vec3(0.018, 0.021, 0.025);
    return vec3(0.15, 0.15, 0.135);
  }

  void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(cameraPosition - vW);
    vec3 base = cloth(vSeed);
    if (vPart > 3.5) base = cloth(vSeed + 0.31) * 0.45;
    else if (vPart > 2.5) base = vec3(0.01);
    else if (vPart > 0.5) base = vec3(0.1, 0.073, 0.056) * (0.5 + 0.8 * fract(vSeed * 7.3));

    // scena lumineaza din fata si de sus; aproape de ea e lumina multa, in spate aproape deloc
    vec3 toStage = vec3(uStageXZ.x, 12.0, uStageXZ.y) - vW;
    float ds = length(toStage.xz);
    vec3 L = normalize(toStage);
    float reach = uStage * 1.5 / (1.0 + ds * ds / 520.0);
    float stage = (0.12 + 0.88 * max(dot(N, L), 0.0)) * reach;
    vec3 to2 = vec3(uStage2.x, 7.0, uStage2.y) - vW;
    float d2 = length(to2.xz);
    float stage2 = max(dot(N, normalize(to2)), 0.0) * uStage2.z / (1.0 + d2 * d2 / 160.0);

    // reflectorul pinului bate de sus: umeri si crestete
    vec2 dp = vW.xz - uPin;
    float top = max(N.y, 0.0);
    float pool = exp(-dot(dp, dp) / 30.0) * uSpot * (0.16 + 1.25 * top * top);

    float sky = 0.032 + 0.03 * N.y;
    vec3 light = vec3(sky) + uStageCol * stage + vec3(0.83, 0.85, 0.7) * stage2 + vec3(1.0, 1.0, 0.94) * pool + vLocal * (0.55 + 0.9 * top);

    // ce duce raportul lumineaza in jur
    vec3 toGlow = uGlow.xyz - vW;
    float dg = length(toGlow);
    light += uGlowCol * (0.3 + 0.7 * max(dot(N, toGlow / max(dg, 0.001)), 0.0)) * uGlow.w / (1.0 + dg * dg * 0.9);

    vec3 col = base * light;

    // privita dinspre spate, multimea e o silueta cu margini luminate de scena
    float rim = pow(clamp(1.0 - dot(N, V), 0.0, 1.0), 2.4);
    float behind = max(dot(-V, L), 0.0);
    col += uStageCol * rim * (0.2 + 0.8 * behind) * max(dot(N, L) + 0.45, 0.0) * reach * 0.34;

    if (vFace.x < 8.0) {
      vec2 a = abs(vFace);
      float glassMask = smoothstep(0.97, 0.86, max(a.x, a.y));
      // cei mai multi filmeaza scena: benzi negre sus si jos, la mijloc luminile ei; aplicatia umple tot ecranul
      float view = smoothstep(0.68, 0.62, a.y);
      float lights = 0.4 + 0.6 * exp(-(vFace.x * vFace.x * 1.3 + (vFace.y - 0.12) * (vFace.y - 0.12) * 5.0));
      float picture = mix(mix(0.09, lights, view), 0.86 + 0.14 * vFace.y, vPlain);
      col = mix(vec3(0.004), vScreen * picture, glassMask);
    }

    float fog = 1.0 - exp(-uFogDensity * uFogDensity * vDist * vDist);
    gl_FragColor = vec4(mix(col, uFogColor, fog), 1.0);
    #include <colorspace_fragment>
  }
`

/**
 * Cate un om pentru fiecare telefon. `shared` aduce ritmul, ceata, harta de lumini de pe sol si starea luminilor
 * din multime, ca ecranele sa se aprinda odata cu ele. Doar oamenii din `near` ([x, z, raza]), unde camera vine
 * aproape, primesc silueta fina; restul, vazuti de departe, una cu mai putine fete.
 */
export function createPeople(phones, shared, { detail = 1, wakeSpeed = 36, near = [] } = {}) {
  // cei cu aplicatia stau primii, restul amestecati: cand scena e rarita, pleaca oameni de peste tot
  const list = phones.filter((p) => p.figure !== false)
  const order = list
    .map((p, i) => [p.app ? -1 : Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1, p])
    .sort((a, b) => a[0] - b[0])
    .map((e) => e[1])
  // varfurile comune ale fetelor netede se calculeaza o singura data
  const shape = (d) => mergeVertices(personGeometry(d), 1e-4)
  const make = (base, count) => {
    const geo = new THREE.InstancedBufferGeometry()
    geo.setIndex(base.index)
    geo.setAttribute('position', base.attributes.position)
    geo.setAttribute('normal', base.attributes.normal)
    geo.setAttribute('aPart', base.attributes.aPart)
    geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3))
    geo.setAttribute('aWho', new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4))
    geo.instanceCount = count
    return geo
  }
  const uniforms = {
    ...shared,
    uShow: { value: 1 },
    uStage: { value: 1 },
    uStageCol: { value: new THREE.Color('#EAF6EC') },
    uStage2: { value: new THREE.Vector3(0, 0, 0.5) },
    uSpot: { value: 1 },
    uPin: { value: new THREE.Vector2() },
    uGlow: { value: new THREE.Vector4(0, 0, 0, 0) },
    uGlowCol: { value: new THREE.Color('#FF9F0A') },
  }
  const material = new THREE.ShaderMaterial({ vertexShader: vertex(wakeSpeed), fragmentShader: fragment, uniforms })

  const close = (p) => near.some(([x, z, r]) => (p.x - x) ** 2 + (p.z - z) ** 2 < r * r)
  const fine = shape(detail)
  const coarse = detail ? shape(0) : fine
  const groups = detail ? [[fine, order.filter(close)], [coarse, order.filter((p) => !close(p))]] : [[fine, order]]
  const mesh = new THREE.Group()
  const parts = groups.map(([base, people]) => {
    const geo = make(base, people.length)
    const pos = geo.attributes.aPos
    const who = geo.attributes.aWho
    people.forEach((p, i) => {
      pos.setXYZ(i, p.x, p.y, p.z)
      who.setXYZW(i, p.seed, p.energy, p.face, p.app ? 1 : 0)
    })
    const m = new THREE.Mesh(geo, material)
    m.frustumCulled = false
    mesh.add(m)
    return { geo, count: people.length }
  })

  // trecatorul care duce raportul: acelasi om, mutat in fiecare cadru
  const soloGeo = make(fine, 1)
  soloGeo.attributes.aPos.setUsage(THREE.DynamicDrawUsage)
  soloGeo.attributes.aWho.setUsage(THREE.DynamicDrawUsage)
  const solo = new THREE.Mesh(soloGeo, material)
  solo.frustumCulled = false
  solo.visible = false

  return {
    mesh,
    solo,
    uniforms,
    /** Pastreaza doar o parte din oameni, pentru telefoanele care nu tin pasul. */
    thin(share) {
      for (const { geo, count } of parts) geo.instanceCount = Math.max(1, Math.round(count * share))
    },
    moveSolo(x, y, z, face) {
      soloGeo.attributes.aPos.setXYZ(0, x, y, z)
      soloGeo.attributes.aWho.setXYZW(0, 0.31, 0, face, 2)
      soloGeo.attributes.aPos.needsUpdate = true
      soloGeo.attributes.aWho.needsUpdate = true
    },
  }
}
