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

export function createPost(renderer, scene, camera, quality) {
  // Scena se deseneaza netezita intr-o tinta a ei. Pasii de dupa lucreaza pe tinte simple: stralucirea scrie
  // peste imaginea citita, iar o tinta netezita isi pierde continutul dupa ce a fost citita.
  const frame = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 })
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }))
  composer.addPass(new TexturePass(frame.texture))
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.62, 0.72, 0.8)
  composer.addPass(bloom)
  const finish = new FinishPass()
  composer.addPass(finish)
  return {
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
