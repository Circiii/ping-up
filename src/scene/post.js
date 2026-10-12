// Dupa desenarea scenei: stralucire in jurul luminilor, apoi culoarea finala, cu vigneta si putin grauncior.
import * as THREE from 'three'
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'

/** Cand stralucirea e oprita, pasul final aduna negru. */
const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1)
black.needsUpdate = true

/** Ultimul pas: tonurile si spatiul de culoare ale ecranului, colturile mai inchise, grauncior care ascunde benzile. */
class FinishPass extends Pass {
  constructor() {
    super()
    this.uniforms = {
      tDiffuse: { value: null },
      tBloom: { value: black },
      toneMappingExposure: { value: 1 },
      uTime: { value: 0 },
      uGrain: { value: 0.016 },
      uVignette: { value: 0.3 },
    }
    this.material = new THREE.RawShaderMaterial({
      uniforms: this.uniforms,
      defines: { SRGB_TRANSFER: '' },
      vertexShader: /* glsl */ `
        precision highp float;
        uniform mat4 modelViewMatrix;
        uniform mat4 projectionMatrix;
        attribute vec3 position;
        attribute vec2 uv;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D tDiffuse, tBloom;
        uniform float uTime, uGrain, uVignette;
        #include <tonemapping_pars_fragment>
        #include <colorspace_pars_fragment>
        varying vec2 vUv;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main() {
          // stralucirea vine pe jumatate de rezolutie si se aduna aici, nu intr-o trecere a ei peste toata imaginea
          vec3 c = texture2D(tDiffuse, vUv).rgb + texture2D(tBloom, vUv).rgb;
          vec2 q = (vUv - 0.5) * vec2(1.0, 0.86);
          c *= 1.0 - uVignette * smoothstep(0.32, 0.86, length(q));
          c = NeutralToneMapping(c);
          c = sRGBTransferOETF(vec4(c, 1.0)).rgb;
          c += (hash(gl_FragCoord.xy + fract(uTime) * 71.0) - 0.5) * uGrain;
          gl_FragColor = vec4(c, 1.0);
        }
      `,
    })
    this.quad = new FullScreenQuad(this.material)
  }

  render(renderer, writeBuffer, readBuffer) {
    this.uniforms.tDiffuse.value = readBuffer.texture
    this.uniforms.toneMappingExposure.value = renderer.toneMappingExposure
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer)
    this.quad.render(renderer)
  }

  dispose() {
    this.material.dispose()
    this.quad.dispose()
  }
}

/**
 * Adancimea de camp, ca la un obiectiv: ce sta la distanta subiectului ramane clar, primul plan si fundalul se
 * topesc. Doua treceri (orizontal, apoi vertical); prima scrie si cat de neclar e fiecare punct, a doua il refoloseste.
 */
class DofPass extends Pass {
  constructor(depth, camera) {
    super()
    this.camera = camera
    this.uniforms = {
      tDiffuse: { value: null },
      tDepth: { value: depth },
      uNear: { value: 0.3 },
      uFar: { value: 2000 },
      uFocus: { value: 10 },
      uRange: { value: 4 },
      uBlur: { value: 0 },
      uDir: { value: new THREE.Vector2(1, 0) },
      uTexel: { value: new THREE.Vector2() },
      uFirst: { value: 1 },
    }
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */ `
        #include <packing>
        uniform sampler2D tDiffuse, tDepth;
        uniform float uNear, uFar, uFocus, uRange, uBlur, uFirst;
        uniform vec2 uDir, uTexel;
        varying vec2 vUv;
        float coc(vec2 uv) {
          if (uFirst < 0.5) return texture2D(tDiffuse, uv).a;
          float z = -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar);
          return smoothstep(uRange * 0.4, uRange * 1.8, abs(z - uFocus));
        }
        void main() {
          float c0 = coc(vUv);
          vec3 sum = vec3(0.0);
          float wsum = 0.0;
          for (int i = -5; i <= 5; i++) {
            float t = float(i) / 5.0;
            vec2 uv = vUv + uDir * uTexel * t * uBlur * c0;
            // ce e clar nu se scurge peste ce e neclar
            float w = exp(-t * t * 2.2) * mix(0.3, 1.0, coc(uv));
            sum += texture2D(tDiffuse, uv).rgb * w;
            wsum += w;
          }
          gl_FragColor = vec4(sum / wsum, c0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    })
    this.quad = new FullScreenQuad(this.material)
    this.half = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType })
  }

  setSize(w, h) {
    this.half.setSize(w, h)
    this.uniforms.uTexel.value.set(1 / w, 1 / h)
  }

  render(renderer, writeBuffer, readBuffer) {
    const u = this.uniforms
    u.uNear.value = this.camera.near
    u.uFar.value = this.camera.far
    u.tDiffuse.value = readBuffer.texture
    u.uDir.value.set(1, 0)
    u.uFirst.value = 1
    renderer.setRenderTarget(this.half)
    this.quad.render(renderer)
    u.tDiffuse.value = this.half.texture
    u.uDir.value.set(0, 1)
    u.uFirst.value = 0
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer)
    this.quad.render(renderer)
  }

  dispose() {
    this.material.dispose()
    this.quad.dispose()
    this.half.dispose()
  }
}

/**
 * Stralucirea lui UnrealBloomPass, fara ultimul lui pas: in loc sa o adune peste imagine intr-o trecere separata, pe
 * toata rezolutia, o lasa in textura pe jumatate de rezolutie, pe care o aduna pasul final, odata cu tonurile.
 */
class GlowPass extends UnrealBloomPass {
  get texture() {
    return this.renderTargetsHorizontal[0].texture
  }

  glow(renderer, input) {
    renderer.getClearColor(this._oldClearColor)
    this._oldClearAlpha = renderer.getClearAlpha()
    const oldAutoClear = renderer.autoClear
    renderer.autoClear = false
    renderer.setClearColor(this.clearColor, 0)
    const pass = (material, target) => {
      this._fsQuad.material = material
      renderer.setRenderTarget(target)
      renderer.clear()
      this._fsQuad.render(renderer)
    }
    // partile luminoase, apoi fiecare treapta inmuiata pe orizontala si pe verticala, apoi toate la un loc
    this.highPassUniforms.tDiffuse.value = input
    this.highPassUniforms.luminosityThreshold.value = this.threshold
    pass(this.materialHighPassFilter, this.renderTargetBright)
    let from = this.renderTargetBright
    for (let i = 0; i < this.nMips; i++) {
      const blur = this.separableBlurMaterials[i]
      blur.uniforms.colorTexture.value = from.texture
      blur.uniforms.direction.value = UnrealBloomPass.BlurDirectionX
      pass(blur, this.renderTargetsHorizontal[i])
      blur.uniforms.colorTexture.value = this.renderTargetsHorizontal[i].texture
      blur.uniforms.direction.value = UnrealBloomPass.BlurDirectionY
      pass(blur, this.renderTargetsVertical[i])
      from = this.renderTargetsVertical[i]
    }
    this.compositeMaterial.uniforms.bloomStrength.value = this.strength
    this.compositeMaterial.uniforms.bloomRadius.value = this.radius
    this.compositeMaterial.uniforms.bloomTintColors.value = this.bloomTintColors
    pass(this.compositeMaterial, this.renderTargetsHorizontal[0])
    renderer.setClearColor(this._oldClearColor, this._oldClearAlpha)
    renderer.autoClear = oldAutoClear
  }
}

export function createPost(renderer, scene, camera, quality) {
  // Scena se deseneaza netezita intr-o tinta a ei, cu tot cu adancime, pentru adancimea de camp. De acolo citesc
  // direct ceilalti pasi: adancimea de camp (doar cand e nevoie) scrie intr-o tinta simpla, stralucirea se face pe
  // jumatate de rezolutie, iar pasul final le aduna pe ecran. Fara copii intermediare pe toata rezolutia: pe placile
  // video integrate, fiecare inseamna zeci de MB mutati prin memorie in fiecare cadru.
  const frame = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4, depthTexture: new THREE.DepthTexture(1, 1) })
  const sharp = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType })
  const dof = new DofPass(frame.depthTexture, camera)
  dof.enabled = false
  const bloom = new GlowPass(new THREE.Vector2(1, 1), 0.62, 0.72, 0.8)
  const finish = new FinishPass()
  finish.renderToScreen = true
  // pasii citesc imaginea dintr-un obiect cu `texture`, ca dintr-o tinta
  const input = { texture: null }

  function draw() {
    let image = frame.texture
    if (dof.enabled) {
      input.texture = image
      dof.render(renderer, sharp, input)
      image = sharp.texture
    }
    if (bloom.enabled) bloom.glow(renderer, image)
    finish.uniforms.tBloom.value = bloom.enabled ? bloom.texture : black
    input.texture = image
    finish.render(renderer, null, input)
  }

  return {
    /** Tinta in care se deseneaza scena: shaderele ei se compileaza pentru ea (fara tonuri, cu culori liniare). */
    target: frame,
    /** Un cadru cu toti pasii porniti, ca sa li se compileze shaderele inainte de prima derulare. */
    warm() {
      const d = dof.enabled
      const b = bloom.enabled
      dof.enabled = bloom.enabled = true
      draw()
      dof.enabled = d
      bloom.enabled = b
    },
    get bloom() { return bloom.enabled },
    /** Fara stralucire si fara adancime de camp, dar tot cu imaginea netezita si culoarea finala. */
    dropBloom() {
      bloom.enabled = false
      dof.off = true
    },
    /** Unde e subiectul (distanta de la camera) si cat de tare se topeste restul (0 = deloc). */
    focus(distance, strength, dpr) {
      dof.uniforms.uFocus.value = distance
      dof.uniforms.uRange.value = distance * 0.3
      dof.uniforms.uBlur.value = strength * 7 * dpr
      dof.enabled = !dof.off && strength > 0.02
    },
    resize(w, h, dpr) {
      const W = Math.round(w * dpr)
      const H = Math.round(h * dpr)
      frame.setSize(W, H)
      sharp.setSize(W, H)
      dof.setSize(W, H)
      bloom.setSize(W, H)
    },
    render(t) {
      finish.uniforms.uTime.value = t
      renderer.setRenderTarget(frame)
      renderer.render(scene, camera)
      draw()
    },
  }
}
