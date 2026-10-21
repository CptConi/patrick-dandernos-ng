import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass';
import { Pass } from 'three/examples/jsm/postprocessing/Pass';
import { Ssao } from './ssao';

/**
 * Colour pipeline notes (three r150):
 *  - materials are tone mapped (ACES) by their own shaders even when drawn into a render target, so the
 *    composer buffers hold display-referred LINEAR colour (half float, no banding);
 *  - the final pass only has to apply the sRGB output encoding (`encodings_fragment`) plus the lens effects.
 *    Photo materials (toneMapped: false) therefore keep their exact colours.
 */
const FINAL_SHADER = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uAspect: { value: 1 },
    uVignette: { value: 0.4 },
    uGrain: { value: 0.028 },
    uCA: { value: 0.0018 },
    uFocus: { value: 0 },
    uShade: { value: 0 },
    tAO: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    uAOSize: { value: new THREE.Vector2(1, 1) },
    uNearFar: { value: new THREE.Vector2(0.05, 80) },
    uAO: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uAspect;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uCA;
    uniform float uFocus;
    uniform float uShade;
    uniform sampler2D tAO;
    uniform sampler2D tDepth;
    uniform vec2 uAOSize;
    uniform vec2 uNearFar;
    uniform float uAO;
    varying vec2 vUv;

    float linZ(float d) {
      return (uNearFar.x * uNearFar.y) / (uNearFar.y - (uNearFar.y - uNearFar.x) * d);
    }

    // half resolution occlusion, upsampled with weights that follow the depth so it never bleeds over silhouettes
    float aoUpsample(vec2 uv) {
      float d = texture2D(tDepth, uv).x;
      if (d >= 0.99999) {
        return 1.0;
      }
      float z = linZ(d);
      vec2 p = uv * uAOSize - 0.5;
      vec2 i = floor(p);
      vec2 f = p - i;
      vec2 inv = 1.0 / uAOSize;
      float tol = 1.0 / (0.04 + 0.03 * z);
      vec4 s0 = texture2D(tAO, (i + vec2(0.5, 0.5)) * inv);
      vec4 s1 = texture2D(tAO, (i + vec2(1.5, 0.5)) * inv);
      vec4 s2 = texture2D(tAO, (i + vec2(0.5, 1.5)) * inv);
      vec4 s3 = texture2D(tAO, (i + vec2(1.5, 1.5)) * inv);
      float d0 = (s0.y - z) * tol;
      float d1 = (s1.y - z) * tol;
      float d2 = (s2.y - z) * tol;
      float d3 = (s3.y - z) * tol;
      float w0 = (1.0 - f.x) * (1.0 - f.y) * exp(-d0 * d0) + 1e-4;
      float w1 = f.x * (1.0 - f.y) * exp(-d1 * d1) + 1e-4;
      float w2 = (1.0 - f.x) * f.y * exp(-d2 * d2) + 1e-4;
      float w3 = f.x * f.y * exp(-d3 * d3) + 1e-4;
      return (s0.x * w0 + s1.x * w1 + s2.x * w2 + s3.x * w3) / (w0 + w1 + w2 + w3);
    }

    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec2 c = vUv - 0.5;
      vec2 cc = c * vec2(uAspect, 1.0);
      float r2 = dot(cc, cc);

      // chromatic aberration grows with the square of the distance to the centre
      vec2 off = c * r2 * uCA * (1.0 - uFocus);
      vec3 col = vec3(
        texture2D(tDiffuse, vUv + off).r,
        texture2D(tDiffuse, vUv).g,
        texture2D(tDiffuse, vUv - off).b
      );

      // ambient occlusion: lit / emissive pixels keep their colour, the dim indirect-lit areas take the contact shading
      if (uAO > 0.001) {
        float l0 = dot(col, vec3(0.2126, 0.7152, 0.0722));
        float k = uAO * (1.0 - smoothstep(0.6, 1.25, l0));
        if (k > 0.01) {
          col *= mix(1.0, aoUpsample(vUv), k);
        }
      }

      // vignette (fully off while a photo is displayed so it stays colour accurate)
      float vig = smoothstep(0.18, 0.95, r2 * 1.55);
      col *= 1.0 - vig * uVignette * (1.0 - uFocus);

      // overview: the nearest foreground (bottom of the frame) falls into shadow, which also seats the HTML title
      col *= 1.0 - uShade * 0.62 * smoothstep(0.5, 0.0, vUv.y);

      // very gentle warm lift in the highlights / cool shadows
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col *= mix(vec3(0.985, 0.995, 1.02), vec3(1.02, 1.0, 0.975), smoothstep(0.05, 0.6, l) * (1.0 - uFocus));

      gl_FragColor = vec4(max(col, 0.0), 1.0);
      #include <encodings_fragment>

      // grain after the sRGB conversion so it also dithers the 8 bit output
      float n = hash(gl_FragCoord.xy + fract(uTime * 7.31) * 113.0) - 0.5;
      float g = uGrain * (1.0 - 0.5 * uFocus);
      gl_FragColor.rgb += n * g * (0.55 + 0.45 * (1.0 - l));
    }
  `,
};

export interface PostFxOptions {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
  pixelRatio: number;
  width: number;
  height: number;
}

/** Occlusion strength in the room (the slideshow fades it out so photos keep their exact colours). */
const AO_STRENGTH = 1;

/** Runs the depth-only occlusion right after the scene render (before bloom). */
class SsaoPass extends Pass {
  constructor(private readonly ssao: Ssao) {
    super();
    this.needsSwap = false;
  }

  override render(renderer: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget): void {
    if (read.depthTexture) {
      this.ssao.render(renderer, read.depthTexture);
    }
  }
}

/** Bloom + lens finish. Only built in `high` quality. */
export class PostFx {
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;
  /** Null when the context cannot resolve a multisampled depth texture (WebGL1). */
  readonly ssao: Ssao | null = null;
  private readonly finalPass: ShaderPass;
  private readonly renderPass: RenderPass;
  private readonly ssaoPass: SsaoPass | null = null;
  private bloomBase = { strength: 0.3, threshold: 0.9 };
  private bloomOn = true;
  private aoOn = true;
  private focus = 0;

  constructor(private readonly opts: PostFxOptions) {
    const { renderer, scene, camera } = opts;
    const rt = new THREE.WebGLRenderTarget(
      Math.max(1, Math.round(opts.width * opts.pixelRatio)),
      Math.max(1, Math.round(opts.height * opts.pixelRatio)),
      {
        type: THREE.HalfFloatType,
        format: THREE.RGBAFormat,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: true,
        stencilBuffer: false,
      }
    );
    // MSAA on the buffer that actually receives the scene (readBuffer = rt2 = clone of rt).
    rt.samples = renderer.capabilities.isWebGL2 ? 4 : 0;
    this.composer = new EffectComposer(renderer, rt);
    // The first buffer is never drawn to (the final pass goes straight to the canvas): spare its MSAA storage.
    this.composer.renderTarget1.samples = 0;

    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    if (renderer.capabilities.isWebGL2 && camera instanceof THREE.PerspectiveCamera) {
      // The scene lands in renderTarget2 (the MSAA buffer): three resolves its depth into this texture with the colour.
      this.composer.renderTarget2.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
      this.ssao = new Ssao(camera);
      this.ssaoPass = new SsaoPass(this.ssao);
      this.composer.addPass(this.ssaoPass);
    }

    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(opts.width, opts.height),
      this.bloomBase.strength,
      0.55,
      this.bloomBase.threshold
    );
    this.composer.addPass(this.bloom);

    this.finalPass = new ShaderPass(FINAL_SHADER);
    // The last pass draws to the canvas: no swap, so the scene always renders into the MSAA buffer (a swap per frame
    // used to alternate between the multisampled and the plain buffer, i.e. antialiasing on every other frame only).
    this.finalPass.needsSwap = false;
    this.composer.addPass(this.finalPass);
    if (this.ssao) {
      const u = this.finalPass.uniforms;
      u['tAO'].value = this.ssao.texture;
      u['tDepth'].value = this.composer.renderTarget2.depthTexture;
      (u['uNearFar'].value as THREE.Vector2).set((camera as THREE.PerspectiveCamera).near, (camera as THREE.PerspectiveCamera).far);
    }

    this.setSize(opts.width, opts.height, opts.pixelRatio);
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    this.finalPass.uniforms['uAspect'].value = width / Math.max(1, height);
    if (this.ssao) {
      this.ssao.setSize(Math.floor(width * pixelRatio), Math.floor(height * pixelRatio), pixelRatio > 1.25 ? 3 : 2);
      (this.finalPass.uniforms['uAOSize'].value as THREE.Vector2).set(this.ssao.width, this.ssao.height);
    }
  }

  /** 0 = room, 1 = slideshow: bloom and lens effects fade out so the photo is shown with its own colours. */
  setFocus(amount: number): void {
    this.focus = amount;
    this.bloom.strength = this.bloomBase.strength * (1 - amount);
    this.bloom.threshold = this.bloomBase.threshold + 0.07 * amount;
    this.finalPass.uniforms['uFocus'].value = amount;
    this.applyBloom();
    this.applyAo();
  }

  /** 0..1 darkening of the bottom of the frame (overview). */
  setShade(amount: number): void {
    this.finalPass.uniforms['uShade'].value = amount;
  }

  /** Bloom is the first thing the performance governor drops. */
  setBloomEnabled(on: boolean): void {
    this.bloomOn = on;
    this.applyBloom();
  }

  get bloomEnabled(): boolean {
    return this.bloomOn;
  }

  /** Occlusion is the very first thing the performance governor drops. */
  setAoEnabled(on: boolean): void {
    this.aoOn = on;
    this.applyAo();
  }

  get aoEnabled(): boolean {
    return !!this.ssao && this.aoOn;
  }

  private applyBloom(): void {
    this.bloom.enabled = this.bloomOn && this.focus < 0.995;
  }

  private applyAo(): void {
    const amount = this.aoOn ? AO_STRENGTH * (1 - this.focus) : 0;
    this.finalPass.uniforms['uAO'].value = amount;
    if (this.ssaoPass) {
      this.ssaoPass.enabled = amount > 0.004;
    }
  }

  /** Compile the scene's programs for the render-target variants (avoids a hitch on the first frame). */
  precompile(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.composer.readBuffer);
    renderer.compile(scene, camera);
    renderer.setRenderTarget(prev);
  }

  render(dt: number, time: number): void {
    this.finalPass.uniforms['uTime'].value = time;
    this.composer.render(dt);
  }

  dispose(): void {
    this.composer.renderTarget1.dispose();
    this.composer.renderTarget2.dispose();
    this.bloom.dispose();
    if (this.ssao) {
      this.ssao.dispose();
    }
    this.finalPass.material.dispose();
    (this.finalPass as unknown as { fsQuad: { dispose(): void } }).fsQuad.dispose();
    this.composer.copyPass.dispose();
  }
}
