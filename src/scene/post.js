// Dupa desenarea scenei: stralucire in jurul luminilor, apoi culoarea finala, cu vigneta si putin grauncior.
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js'
import { TexturePass } from 'three/addons/postprocessing/TexturePass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'

/** Ultimul pas: tonurile si spatiul de culoare ale ecranului, colturile mai inchise, grauncior care ascunde benzile. */
class FinishPass extends Pass {
  constructor() {
    super()
    this.uniforms = {
      tDiffuse: { value: null },
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
        uniform sampler2D tDiffuse;
        uniform float uTime, uGrain, uVignette;
        #include <tonemapping_pars_fragment>
        #include <colorspace_pars_fragment>
        varying vec2 vUv;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main() {
          vec3 c = texture2D(tDiffuse, vUv).rgb;
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

export function createPost(renderer, scene, camera, quality) {
  // Scena se deseneaza netezita intr-o tinta a ei. Pasii de dupa lucreaza pe tinte simple: stralucirea scrie
  // peste imaginea citita, iar o tinta netezita isi pierde continutul dupa ce a fost citita.
  // adancimea cadrului ramane si ea, pentru adancimea de camp
  const frame = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4, depthTexture: new THREE.DepthTexture(1, 1) })
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }))
  composer.addPass(new TexturePass(frame.texture))
  const dof = new DofPass(frame.depthTexture, camera)
  dof.enabled = false
  composer.addPass(dof)
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.62, 0.72, 0.8)
  composer.addPass(bloom)
  const finish = new FinishPass()
  composer.addPass(finish)
  return {
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
      frame.setSize(Math.round(w * dpr), Math.round(h * dpr))
      composer.setPixelRatio(dpr)
      composer.setSize(w, h)
    },
    render(t, dt) {
      finish.uniforms.uTime.value = t
      renderer.setRenderTarget(frame)
      renderer.render(scene, camera)
      composer.render(dt)
    },
  }
}
