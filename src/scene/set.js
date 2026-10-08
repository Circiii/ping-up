// Decorul: cerul, scenele, constructiile si legaturile telefoanelor cu antena.
import * as THREE from 'three'
import { rng } from './crowd.js'
import { createProps } from './props.js'
import { BPM, createStages } from './stage.js'

/** Liniile dintre telefoane si antena: o retea care se rupe pe rand. */
function cellLinks(phones, top, count, time) {
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
  const uniforms = { uOn: { value: 0 }, uLoss: { value: 0 }, uTime: time }
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute float aSeed;
      attribute float aEnd;
      varying float vSeed;
      varying float vEnd;
      void main() { vSeed = aSeed; vEnd = aEnd; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOn, uLoss, uTime;
      varying float vSeed;
      varying float vEnd;
      void main() {
        float broken = smoothstep(vSeed - 0.02, vSeed + 0.02, uLoss);
        float gap = (uLoss - vSeed) * 28.0;
        float justBroke = exp(-gap * gap);
        float travel = fract(vEnd * 1.5 - uTime * (0.5 + vSeed) + vSeed * 7.0);
        float dash = smoothstep(0.0, 0.08, travel) * (1.0 - smoothstep(0.08, 0.16, travel));
        float flicker = 0.75 + 0.25 * sin(uTime * 22.0 + vSeed * 80.0);
        vec3 col = vec3(0.86, 0.9, 0.88) * (0.05 + 0.32 * dash) * (1.0 - broken) * mix(1.0, flicker, uLoss);
        col += vec3(1.0, 0.27, 0.23) * justBroke * 0.7;
        gl_FragColor = vec4(col * uOn * (1.0 - vEnd * 0.55), 1.0);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const lines = new THREE.LineSegments(geo, material)
  lines.frustumCulled = false
  return { lines, uniforms }
}

/**
 * Cerul de noapte: negru sus, iar jos ceata prinde lumina oraselor din jur. Deasupra scenei ceata e luminata de
 * proiectoare, in culoarea lor. La orizont, padurea de la marginea campului, ca o silueta.
 */
function sky(time) {
  const group = new THREE.Group()
  const uniforms = { uStage: { value: 1 }, uStageCol: { value: new THREE.Color('#EAF6EC') } }
  const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), new THREE.ShaderMaterial({
    uniforms,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
    fragmentShader: /* glsl */ `
      uniform float uStage;
      uniform vec3 uStageCol;
      varying vec3 vDir;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      void main() {
        float h = vDir.y;
        float up = clamp(h, 0.0, 1.0);
        vec3 col = mix(vec3(0.0135, 0.0125, 0.011), vec3(0.0013, 0.0017, 0.0016), pow(up, 0.42));
        // ceata de deasupra scenei, luminata de proiectoare
        vec3 toStage = normalize(vec3(0.0, 0.1, -1.0));
        float glow = pow(max(dot(vDir, toStage), 0.0), 7.0) * exp(-up * 4.0);
        col += uStageCol * glow * 0.04 * uStage;
        // padurea: o creasta zimtata, calculata pe cerc, ca sa nu aiba cusatura
        vec2 c = normalize(vDir.xz + 1e-5);
        float ridge = 0.012 + 0.016 * noise(c * 7.0) + 0.009 * noise(c * 23.0 + 7.0) + 0.0045 * noise(c * 70.0 + 13.0);
        float wood = 1.0 - smoothstep(ridge - 0.0015, ridge + 0.0015, h);
        col = mix(col, vec3(0.0034, 0.0044, 0.0038), wood);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  }))
  dome.renderOrder = -10
  group.add(dome)

  const rand = rng(77)
  const pos = []
  const seed = []
  for (let i = 0; i < 420; i++) {
    const a = rand() * Math.PI * 2
    const y = 0.1 + Math.pow(rand(), 0.7) * 0.9
    const r = Math.sqrt(1 - y * y)
    pos.push(Math.cos(a) * r * 850, y * 850, Math.sin(a) * r * 850)
    seed.push(rand())
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1))
  const starUniforms = { uTime: time, uDpr: { value: 1 } }
  const stars = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms: starUniforms,
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime, uDpr;
      varying float vA;
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vA = (0.25 + 0.75 * aSeed) * (0.75 + 0.25 * sin(uTime * (0.4 + aSeed) + aSeed * 50.0));
        gl_PointSize = (1.0 + aSeed * 1.2) * uDpr;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        gl_FragColor = vec4(vec3(0.75, 0.8, 0.78) * exp(-dot(p, p) * 2.5) * vA * 0.5, 1.0);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  }))
  stars.frustumCulled = false
  stars.renderOrder = -9
  group.add(stars)
  return { group, uniforms, starUniforms }
}

export function createSet(phones, quality, models = null) {
  const rand = rng(31)
  const group = new THREE.Group()
  const time = { value: 0 }

  const heaven = sky(time)
  const stages = createStages(quality, time, models)
  const props = createProps(quality, rand, time)
  const cell = cellLinks(phones, props.tower.top, quality.low ? 90 : 170, time)
  group.add(heaven.group, stages.group, props.group, cell.lines)

  return {
    group,
    spots: props.spots,
    tower: props.tower,
    tentTop: props.tentTop,
    setView(w, h, dpr) {
      stages.setView(w, h, dpr)
      props.setView(dpr)
      heaven.starUniforms.uDpr.value = dpr
    },
    /** Ecranele si bannerele scriu cu Inter; daca fontul a venit dupa ele, le rescriem. */
    redrawText() {
      stages.redrawText()
      props.redrawText()
    },
    /** Intoarce starea luminilor de scena (culoare si tarie), pentru sol si pentru oameni. */
    update(t, dt, s) {
      time.value = t
      const light = stages.update(t, dt, (t * BPM) / 60, s)
      props.update(t, s)
      heaven.uniforms.uStage.value = light.level
      heaven.uniforms.uStageCol.value.copy(light.color)
      cell.uniforms.uOn.value = s.tower
      cell.uniforms.uLoss.value = s.loss
      return light
    },
  }
}
