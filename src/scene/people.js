// Oamenii din multime, cu telefonul ridicat: lumina fiecarui telefon e ecranul din mana cuiva. Personajele vin din
// people.dat (humans.js); daca fisierul nu se poate incarca, raman siluetele de mai jos, facute din forme simple.
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
export function createPeople(phones, shared, { detail = 1, wakeSpeed = 36, near = [], models = null, low = false } = {}) {
  if (models) return createModelPeople(phones, shared, { wakeSpeed, models, low })
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
    update() {},
  }
}

// ---------------------------------------------------------------- oamenii din people.dat

/** Aceeasi lumina si acelasi ecran de telefon, pe personajele adevarate: pozitia vine deja cu telefonul in (0, 1, 0). */
const modelVertex = (wakeSpeed) => /* glsl */ `
  attribute vec3 aPos;
  attribute vec4 aWho;
  attribute vec3 aColor;
  attribute float aRole;
  attribute vec2 aScreen;
  attribute vec3 aPos2;
  attribute vec3 aNrm2;
  uniform float uShow, uTime, uCrowd, uDim, uMesh, uReveal;
  uniform vec3 uWake;
  uniform vec2 uPin;
  uniform sampler2D uLightTex;
  uniform vec4 uLightRect;
  varying vec3 vN;
  varying vec3 vW;
  varying vec3 vLocal;
  varying vec3 vScreen;
  varying vec3 vColor;
  varying vec2 vFace;
  // rolul nu se amesteca intre varfuri: un triunghi simplificat poate lega parul de piele
  flat varying float vPart;
  varying float vSeed;
  varying float vDist;
  varying float vPlain;
  ${BOUNCE}
  void main() {
    // cine are bratul liber ridicat il strange si il intinde pe ritm, cat canta scena
    float pump = 0.5 + 0.5 * sin(3.14159265 * (uBeat + aWho.x * 1.7));
    float dance = smoothstep(0.2, 0.9, pump) * min(1.0, uBob * 1.4);
    vec3 shape = mix(position, aPos2, dance);
    vec3 nrm = normalize(mix(normal, aNrm2, dance));
    float s = aPos.y * uShow;
    float c = cos(aWho.z);
    float sn = sin(aWho.z);
    vec3 p = shape;
    // se leagana pe ritm, din solduri in sus
    p.x += sin(uBeat * 3.14159265 + aWho.x * 6.2832) * 0.03 * aWho.y * uBob * shape.y;
    p *= s;
    vec3 world = vec3(aPos.x + c * p.x + sn * p.z, p.y + bounce(aWho.x, aWho.y, aPos.xz), aPos.z - sn * p.x + c * p.z);
    vN = normalize(vec3(c * nrm.x + sn * nrm.z, nrm.y, -sn * nrm.x + c * nrm.z));
    vW = world;
    vPart = aRole;
    vSeed = aWho.x;
    vColor = aColor;
    vLocal = texture2D(uLightTex, (aPos.xz - uLightRect.xy) / uLightRect.zw).rgb;
    vFace = aRole > 2.5 && aRole < 3.5 ? aScreen : vec2(9.0);

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

const modelFragment = /* glsl */ `
  uniform vec3 uFogColor, uStageCol, uGlowCol;
  uniform float uFogDensity, uStage, uSpot, uAlbedo;
  uniform vec2 uStageXZ, uPin;
  uniform vec3 uStage2;
  uniform vec4 uGlow;
  varying vec3 vN;
  varying vec3 vW;
  varying vec3 vLocal;
  varying vec3 vScreen;
  varying vec3 vColor;
  varying vec2 vFace;
  // rolul nu se amesteca intre varfuri: un triunghi simplificat poate lega parul de piele
  flat varying float vPart;
  varying float vSeed;
  varying float vDist;
  varying float vPlain;

  // tricouri si hanorace de festival: mult negru si gri, cateva culori
  vec3 tee(float s) {
    float k = floor(fract(s * 13.7) * 10.0);
    if (k < 2.0) return vec3(0.012, 0.013, 0.014);
    if (k < 3.0) return vec3(0.2, 0.2, 0.19);
    if (k < 4.0) return vec3(0.09, 0.09, 0.085);
    if (k < 5.0) return vec3(0.015, 0.025, 0.07);
    if (k < 6.0) return vec3(0.025, 0.07, 0.035);
    if (k < 7.0) return vec3(0.16, 0.025, 0.02);
    if (k < 8.0) return vec3(0.3, 0.2, 0.03);
    if (k < 9.0) return vec3(0.07, 0.08, 0.03);
    return vec3(0.13, 0.22, 0.36);
  }
  vec3 pants(float s) {
    float k = floor(fract(s * 5.31) * 4.0);
    if (k < 1.0) return vec3(0.03, 0.045, 0.09);
    if (k < 2.0) return vec3(0.012);
    if (k < 3.0) return vec3(0.16, 0.13, 0.08);
    return vec3(0.06, 0.062, 0.066);
  }
  // parul: mai ales negru si saten, cateva blonde si roscate
  vec3 hair(float s) {
    float k = floor(fract(s * 17.9) * 8.0);
    if (k < 3.0) return vec3(0.008, 0.006, 0.005);
    if (k < 5.0) return vec3(0.035, 0.016, 0.008);
    if (k < 6.0) return vec3(0.11, 0.055, 0.022);
    if (k < 7.0) return vec3(0.4, 0.3, 0.12);
    return vec3(0.17, 0.045, 0.015);
  }

  void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(cameraPosition - vW);
    // culorile personajului, cu alte haine si alt ton al pielii pentru fiecare om
    vec3 base = vColor;
    if (vPart < 0.5) base = mix(base, tee(vSeed), 0.9);
    else if (vPart < 1.5) base *= 0.45 + 0.7 * fract(vSeed * 7.31);
    else if (vPart < 2.5) base = mix(base, hair(vSeed), 0.85);
    else if (vPart > 3.5 && vPart < 4.5) base = mix(base, pants(vSeed), 0.8);
    base *= uAlbedo;

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

    // cerul de noapte si umbra de la picioare: in mijlocul multimii lumina vine mai greu jos
    float sky = 0.032 + 0.03 * N.y;
    float feet = smoothstep(0.0, 1.1, vW.y);
    vec3 light = vec3(sky) + uStageCol * stage + vec3(0.83, 0.85, 0.7) * stage2 + vec3(1.0, 1.0, 0.94) * pool + vLocal * (0.55 + 0.9 * top);
    light *= 0.55 + 0.45 * feet;

    // ce duce raportul lumineaza in jur
    vec3 toGlow = uGlow.xyz - vW;
    float dg = length(toGlow);
    light += uGlowCol * (0.3 + 0.7 * max(dot(N, toGlow / max(dg, 0.001)), 0.0)) * uGlow.w / (1.0 + dg * dg * 0.9);

    vec3 col = base * light;

    // privita dinspre spate, multimea e o silueta cu margini luminate de scena; doar marginea, nu tot parul
    float rim = pow(clamp(1.0 - dot(N, V), 0.0, 1.0), 4.0);
    float behind = max(dot(-V, L), 0.0);
    float rimK = vPart > 1.5 && vPart < 2.5 ? 0.35 : 1.0;
    col += uStageCol * rim * rimK * (0.2 + 0.8 * behind) * max(dot(N, L) + 0.45, 0.0) * reach * 0.26;

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

// Cat de des apare fiecare personaj in multime.
const CAST = { hoodie: 1, casual: 1.2, beach: 0.55, punk: 0.45, woman: 1.2, tank: 0.85, wcasual: 1 }
const hash = (v) => Math.abs(Math.sin(v * 12.9898 + 78.233) * 43758.5453) % 1

/**
 * Multimea din personajele adevarate, pe trei trepte de detaliu: cei mai apropiati de camera primesc forma fina,
 * restul una tot mai simpla. Impartirea se reface doar cand camera s-a mutat.
 */
function createModelPeople(phones, shared, { wakeSpeed, models, low }) {
  const list = phones.filter((p) => p.figure !== false)
  const order = list
    .map((p, i) => [p.app ? -1 : Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1, p])
    .sort((a, b) => a[0] - b[0])
    .map((e) => e[1])
  const rank = new Map(order.map((p, i) => [p, i]))

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
    uAlbedo: { value: 0.5 },
  }
  const material = new THREE.ShaderMaterial({ vertexShader: modelVertex(wakeSpeed), fragmentShader: modelFragment, uniforms })

  // fiecare om primeste un personaj si o poza: cine tine telefonul sus filmeaza peste capete
  const total = models.chars.reduce((s, c) => s + (CAST[c.id] ?? 1), 0)
  const castOf = (seed) => {
    let r = hash(seed * 3.7) * total
    for (const c of models.chars) if ((r -= CAST[c.id] ?? 1) < 0) return c
    return models.chars[0]
  }
  const variants = []
  const variantOf = new Map()
  const keyFor = (c, pose) => {
    const key = `${c.id}/${pose}`
    if (!variantOf.has(key)) {
      variantOf.set(key, variants.length)
      variants.push({ char: c, pose, people: [] })
    }
    return variantOf.get(key)
  }
  for (const p of list) {
    const c = castOf(p.seed)
    let pose = p.y >= 1.6 ? 'high' : 'eye'
    if (pose === 'high' && c.poses.includes('cheer') && hash(p.seed * 9.1) < 0.3) pose = 'cheer'
    const v = keyFor(c, pose)
    variants[v].people.push(p)
  }

  const mesh = new THREE.Group()
  // `morph`: a doua poza a aceluiasi om (aceleasi varfuri), spre care trece pe ritm; altfel, el insusi
  const make = (geometry, count, morph = geometry) => {
    const geo = new THREE.InstancedBufferGeometry()
    geo.setIndex(geometry.index)
    for (const name of ['position', 'normal', 'aColor', 'aRole', 'aScreen']) geo.setAttribute(name, geometry.attributes[name])
    geo.setAttribute('aPos2', morph.attributes.position)
    geo.setAttribute('aNrm2', morph.attributes.normal)
    geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute('aWho', new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4).setUsage(THREE.DynamicDrawUsage))
    geo.instanceCount = 0
    return geo
  }
  // o plasa pentru fiecare personaj, poza si treapta; se aprind doar cele care au oameni
  const buckets = variants.map((v) =>
    v.char.lods.map((lod) => {
      const morph = v.pose === 'cheer' && lod.poses.pump ? lod.poses.pump.geometry : undefined
      const geo = make(lod.poses[v.pose].geometry, v.people.length, morph)
      const m = new THREE.Mesh(geo, material)
      m.frustumCulled = false
      m.visible = false
      mesh.add(m)
      return { geo, m, n: 0 }
    }),
  )

  // de aproape forma fina, din multime una mai simpla, de departe cea mai simpla; pe telefoane mai putini fini.
  // Cine nu intra in cadru nu se deseneaza deloc.
  const FINE = low ? 90 : 320
  const NEAR = 15
  const MID = low ? 30 : 46
  let keep = order.length
  let dirty = true
  const last = new THREE.Vector3(1e9, 0, 0)
  const lastDir = new THREE.Vector3()
  const dir = new THREE.Vector3()
  const frustum = new THREE.Frustum()
  const viewProj = new THREE.Matrix4()
  const sphere = new THREE.Sphere(new THREE.Vector3(), 2.6)
  const near = []

  function rebuild(camera) {
    const cam = camera.position
    last.copy(cam)
    camera.getWorldDirection(lastDir)
    dirty = false
    near.length = 0
    viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    frustum.setFromProjectionMatrix(viewProj)
    for (const v of buckets) for (const b of v) b.n = 0
    // cei mai apropiati, cel mult FINE, primesc forma fina
    for (const v of variants) {
      for (const p of v.people) {
        p.lodD = -1
        if (rank.get(p) >= keep) continue
        sphere.center.set(p.x, p.y * 0.55, p.z)
        if (!frustum.intersectsSphere(sphere)) continue
        const d = (p.x - cam.x) ** 2 + (p.y - cam.y) ** 2 + (p.z - cam.z) ** 2
        p.lodD = d
        if (d < NEAR * NEAR) near.push(p)
      }
    }
    if (near.length > FINE) near.sort((a, b) => a.lodD - b.lodD).length = FINE
    const fine = new Set(near)
    let shadowN = 0
    variants.forEach((v, vi) => {
      for (const p of v.people) {
        if (p.lodD < 0) continue
        // umbre doar unde se vede solul de aproape
        if (p.lodD < MID * MID) {
          shadowGeo.attributes.aPos.setXYZ(shadowN, p.x, p.y, p.z)
          shadowGeo.attributes.aWho.setXYZW(shadowN, p.seed, p.energy, p.face, 0)
          shadowN++
        }
        const level = fine.has(p) ? 0 : p.lodD < MID * MID ? 1 : 2
        const b = buckets[vi][Math.min(level, buckets[vi].length - 1)]
        b.geo.attributes.aPos.setXYZ(b.n, p.x, p.y, p.z)
        b.geo.attributes.aWho.setXYZW(b.n, p.seed, p.energy, p.face, p.app ? 1 : 0)
        b.n++
      }
    })
    shadowGeo.instanceCount = shadowN
    if (shadowN) {
      shadowGeo.attributes.aPos.addUpdateRange(0, shadowN * 3)
      shadowGeo.attributes.aWho.addUpdateRange(0, shadowN * 4)
      shadowGeo.attributes.aPos.needsUpdate = true
      shadowGeo.attributes.aWho.needsUpdate = true
    }
    for (const v of buckets) {
      for (const b of v) {
        b.geo.instanceCount = b.n
        b.m.visible = b.n > 0
        if (b.n) {
          b.geo.attributes.aPos.addUpdateRange(0, b.n * 3)
          b.geo.attributes.aWho.addUpdateRange(0, b.n * 4)
          b.geo.attributes.aPos.needsUpdate = true
          b.geo.attributes.aWho.needsUpdate = true
        }
      }
    }
  }

  // umbra moale de sub fiecare om: fara ea, oamenii par lipiti peste iarba
  const shadowGeo = new THREE.InstancedBufferGeometry()
  shadowGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1]), 3))
  shadowGeo.setIndex([0, 2, 1, 0, 3, 2])
  shadowGeo.setAttribute('aPos', new THREE.InstancedBufferAttribute(new Float32Array(list.length * 3), 3).setUsage(THREE.DynamicDrawUsage))
  shadowGeo.setAttribute('aWho', new THREE.InstancedBufferAttribute(new Float32Array(list.length * 4), 4).setUsage(THREE.DynamicDrawUsage))
  shadowGeo.instanceCount = 0
  const shadows = new THREE.Mesh(shadowGeo, new THREE.ShaderMaterial({
    uniforms: { uShow: uniforms.uShow, uBeat: shared.uBeat, uBob: shared.uBob, uStageXZ: shared.uStageXZ },
    vertexShader: /* glsl */ `
      attribute vec3 aPos;
      attribute vec4 aWho;
      uniform float uShow;
      varying vec2 vQ;
      varying float vK;
      ${BOUNCE}
      void main() {
        // cand sare, umbra se strange si se deschide
        float up = bounce(aWho.x, aWho.y, aPos.xz);
        float r = aPos.y * 0.36 * uShow * (1.0 - up * 2.2);
        vQ = position.xz;
        vK = uShow * (1.0 - up * 3.0);
        gl_Position = projectionMatrix * viewMatrix * vec4(aPos.x + position.x * r, 0.03, aPos.z + position.z * r * 0.8, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vQ;
      varying float vK;
      void main() {
        float a = exp(-dot(vQ, vQ) * 3.2) * 0.55 * vK;
        gl_FragColor = vec4(0.0, 0.0, 0.0, a);
      }
    `,
    transparent: true,
    depthWrite: false,
  }))
  shadows.frustumCulled = false
  shadows.renderOrder = 1
  mesh.add(shadows)

  // trecatorul care duce raportul: merge prin multime cu telefonul in fata
  const walker = models.chars.find((c) => c.poses.includes('walk')) ?? models.chars[0]
  const soloGeo = make(walker.lods[0].poses[walker.poses.includes('walk') ? 'walk' : walker.poses[0]].geometry, 1)
  soloGeo.instanceCount = 1
  const solo = new THREE.Mesh(soloGeo, material)
  solo.frustumCulled = false
  solo.visible = false

  return {
    mesh,
    solo,
    uniforms,
    /** Pastreaza doar o parte din oameni, pentru telefoanele care nu tin pasul. */
    thin(share) {
      keep = Math.max(1, Math.round(order.length * share))
      dirty = true
    },
    moveSolo(x, y, z, face) {
      soloGeo.attributes.aPos.setXYZ(0, x, y, z)
      soloGeo.attributes.aWho.setXYZW(0, 0.31, 0, face, 2)
      soloGeo.attributes.aPos.needsUpdate = true
      soloGeo.attributes.aWho.needsUpdate = true
    },
    /** Imparte oamenii pe trepte dupa departarea de camera, cand ea s-a mutat sau s-a rotit destul. */
    update(camera) {
      camera.getWorldDirection(dir)
      if (dirty || camera.position.distanceToSquared(last) > 0.36 || dir.dot(lastDir) < 0.9995) rebuild(camera)
    },
  }
}

/** Un om de pe scena, fara telefon: personajul cu mainile sus, de inaltimea data. */
export function performerGeometry(models, id, height) {
  const c = models.chars.find((ch) => ch.id === id) ?? models.chars[0]
  const pose = c.poses.includes('cheer') ? 'cheer' : c.poses[0]
  const { geometry, height: top } = c.lods[0].poses[pose]
  const body = new THREE.BufferGeometry()
  body.setAttribute('position', geometry.attributes.position)
  body.setAttribute('normal', geometry.attributes.normal)
  body.setIndex(new THREE.BufferAttribute(geometry.index.array.slice(0, c.lods[0].bodyIndexCount), 1))
  const g = body.toNonIndexed()
  g.scale(height / top, height / top, height / top)
  return g
}
