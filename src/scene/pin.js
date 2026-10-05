import * as THREE from 'three'

// Conturul pinului din logo (grila de 512), cu centrul in lentila (256, 196) si y in sus.
function outline() {
  const s = new THREE.Shape()
  s.moveTo(-132, 0)
  s.absarc(0, 0, 132, Math.PI, 0, true)
  s.bezierCurveTo(132, -90, 62, -156, 18, -214)
  s.quadraticCurveTo(0, -238, -18, -214)
  s.bezierCurveTo(-62, -156, -132, -90, -132, 0)
  return s
}

const DEPTH = 46
const HEIGHT = 370 // de la varful pinului la crestet, in unitatile logo-ului

const lin = (hex) => new THREE.Color(hex)

/** Fata pinului are cele trei fatete din logo: salvia sus, padurea in stanga, verdele in dreapta. */
function faceMaterial() {
  const m = new THREE.MeshPhysicalMaterial({ roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.32, envMapIntensity: 0.7 })
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uGreen = { value: lin('#30D158') }
    shader.uniforms.uForest = { value: lin('#2B5E45') }
    shader.uniforms.uSage = { value: lin('#D3D8B2') }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocal;\nuniform vec3 uGreen, uForest, uSage;')
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `
        float ang = degrees(atan(vLocal.y, vLocal.x));
        if (ang < 0.0) ang += 360.0;
        float aa = fwidth(ang) * 1.5 + 0.001;
        float cap = smoothstep(34.9 - aa, 34.9 + aa, ang) * (1.0 - smoothstep(150.0 - aa, 150.0 + aa, ang));
        float left = smoothstep(150.0 - aa, 150.0 + aa, ang) * (1.0 - smoothstep(270.0 - aa, 270.0 + aa, ang));
        vec3 c = mix(uGreen, uForest, left);
        c = mix(c, uSage, cap);
        float r = length(vLocal.xy);
        c *= 1.0 - 0.3 * (1.0 - smoothstep(82.0, 84.0, r));
        c = mix(c, vec3(1.0), 0.12 * smoothstep(-40.0, 132.0, vLocal.y));
        vec4 diffuseColor = vec4(c, opacity);
        `,
      )
  }
  return m
}

/** Grosimea: stanga in verdele de padure, dreapta in verdele inchis, ca in iconita. */
function sideMaterial() {
  const m = new THREE.MeshPhysicalMaterial({ roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.4, envMapIntensity: 0.6 })
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uRightTop = { value: lin('#25A345') }
    shader.uniforms.uRightLow = { value: lin('#17642A') }
    shader.uniforms.uLeftTop = { value: lin('#224936') }
    shader.uniforms.uLeftLow = { value: lin('#152D21') }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocal;\nuniform vec3 uRightTop, uRightLow, uLeftTop, uLeftLow;')
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `
        float t = smoothstep(132.0, -238.0, vLocal.y);
        vec3 right = mix(uRightTop, uRightLow, t);
        vec3 leftc = mix(uLeftTop, uLeftLow, t);
        vec3 c = mix(leftc, right, smoothstep(-4.0, 4.0, vLocal.x));
        vec4 diffuseColor = vec4(c, opacity);
        `,
      )
  }
  return m
}

/** Lentila: sticla intunecata, cu luciul si zambetul din logo. Luciul se muta putin dupa cursor. */
function lensMaterial() {
  const m = new THREE.MeshPhysicalMaterial({
    color: '#171A18', roughness: 0.08, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.4,
  })
  const look = { value: new THREE.Vector2() }
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uLook = look
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocal;\nuniform vec2 uLook;')
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `
        vec2 q = vLocal.xy;
        float g = length(q - vec2(-21.6, 32.4)) / 115.2;
        vec3 c = mix(vec3(0.35, 0.36, 0.355), vec3(0.022, 0.03, 0.025), smoothstep(0.0, 0.5, g));
        c = mix(c, vec3(0.009, 0.011, 0.01), smoothstep(0.5, 1.0, g));
        vec4 diffuseColor = vec4(c, opacity);
        `,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `
        #include <emissivemap_fragment>
        vec2 h = q - vec2(-22.0, 30.0) - uLook * 9.0;
        float ca = cos(radians(28.0));
        float sa = sin(radians(28.0));
        h = vec2(ca * h.x + sa * h.y, -sa * h.x + ca * h.y);
        float spot = 1.0 - smoothstep(0.8, 1.05, length(h / vec2(34.0, 17.0)));
        float ang = degrees(atan(q.y, q.x));
        float arc = abs(length(q) - 57.6);
        float smile = (1.0 - smoothstep(2.4, 3.6, arc)) * step(-141.0, ang) * step(ang, -39.0);
        totalEmissiveRadiance += vec3(0.42) * spot + vec3(0.2) * smile;
        `,
      )
  }
  return { material: m, look }
}

export function createPin() {
  const geo = new THREE.ExtrudeGeometry(outline(), {
    depth: DEPTH,
    bevelEnabled: true,
    bevelThickness: 9,
    bevelSize: 7,
    bevelSegments: 6,
    curveSegments: 72,
  })
  geo.translate(0, 0, -DEPTH / 2)
  const body = new THREE.Mesh(geo, [faceMaterial(), sideMaterial()])

  const lens = lensMaterial()
  const domeGeo = new THREE.SphereGeometry(72, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2)
  domeGeo.rotateX(Math.PI / 2)
  domeGeo.scale(1, 1, 0.26)
  const dome = new THREE.Mesh(domeGeo, lens.material)
  dome.position.z = DEPTH / 2 + 9 - 2

  const inner = new THREE.Group()
  inner.add(body, dome)
  const scale = 5.2 / HEIGHT
  inner.scale.setScalar(scale)
  inner.traverse((o) => { o.castShadow = false; o.receiveShadow = false })

  const root = new THREE.Group()
  root.add(inner)
  return {
    root,
    look: lens.look,
    /** de la centrul lentilei pana la varf, in unitatile scenei */
    tipOffset: 238 * scale,
    height: HEIGHT * scale,
  }
}
