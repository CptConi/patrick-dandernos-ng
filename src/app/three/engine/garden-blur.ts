import * as THREE from 'three';
import { BAY } from '../room/shell-bay';
import { HAZE_HEX } from '../room/garden-kit';

/**
 * Light depth of field for the garden seen through the bay window.
 *
 * The garden group is moved to a private scene and drawn on its own, with the main camera, into a half-resolution
 * half-float target (linear, no tone mapping: the garden materials are unlit and un-mapped anyway). A separable
 * gaussian whose radius grows with the distance behind the window (rebuilt per pixel from the depth buffer, the same
 * measure the garden haze uses) softens it, and the result is drawn as a screen-space quad behind everything else in
 * the main scene. The room is therefore rendered sharp and correctly occludes the blurred garden, and the steel grid
 * never samples the blur. The quad does its own output encoding so the colours match the old direct render.
 * Only the screen rectangle covered by the window is drawn and blurred (scissor), so the cost follows the window size.
 *
 * Only built together with the composer. `setEnabled(false)` hands the garden back to the main scene.
 */

/** Target size relative to the drawing buffer. */
const SCALE = 0.5;
/**
 * Gaussian sigma in target texels at the window / far away (one texel = two buffer pixels), for a target
 * REF_HEIGHT texels tall (1080p at pixel ratio 1); it scales with the target so the softness looks the same at any size.
 */
const SIGMA_NEAR = 1.0;
const SIGMA_FAR = 2.3;
const REF_HEIGHT = 540;
/** Distance behind the window (m) at which the blur has covered ~63 % of the near -> far range. */
const FALLOFF = 14;
/** Plane the garden haze is measured from (garden-kit HAZE_VERT). */
const HAZE_Z = -4.7;
const TAPS = 5;
/** Tap spacing in sigmas: 2 * TAPS * SPACING ~ 6 sigmas of support. */
const SPACING = 0.6;

const PASS_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const BLUR_FRAG = /* glsl */ `
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform vec2 uDir;
  uniform mat4 uProjInv;
  uniform mat4 uCamWorld;
  uniform vec2 uSigma;
  uniform float uFall;
  uniform float uHazeZ;
  varying vec2 vUv;

  void main() {
    float d = texture2D(tDepth, vUv).x;
    vec4 v = uProjInv * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
    float wz = (uCamWorld * (v / v.w)).z;
    float beyond = max(0.0, -wz - uHazeZ);
    float sigma = mix(uSigma.x, uSigma.y, 1.0 - exp(-beyond / uFall));
    vec2 stp = uDir * sigma * ${SPACING.toFixed(2)};
    vec4 acc = texture2D(tColor, vUv);
    float sum = 1.0;
    for (int i = 1; i <= ${TAPS}; i++) {
      float k = float(i);
      float w = exp(-0.5 * k * k * ${(SPACING * SPACING).toFixed(2)});
      acc += w * (texture2D(tColor, vUv + stp * k) + texture2D(tColor, vUv - stp * k));
      sum += 2.0 * w;
    }
    gl_FragColor = acc / sum;
  }
`;

const QUAD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`;

const QUAD_FRAG = /* glsl */ `
  uniform sampler2D tMap;
  varying vec2 vUv;
  void main() {
    gl_FragColor = vec4(texture2D(tMap, vUv).rgb, 1.0);
    #include <encodings_fragment>
  }
`;

export interface GardenBlurOptions {
  renderer: THREE.WebGLRenderer;
  /** The main scene: receives the background quad. */
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** The garden group (a child of the room): drawn by this pass instead of the main scene while enabled. */
  garden: THREE.Object3D;
  /** CSS size and pixel ratio of the drawing buffer. */
  width: number;
  height: number;
  pixelRatio: number;
}

export class GardenBlur {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly garden: THREE.Object3D;
  private readonly home: THREE.Object3D | null;
  private readonly gardenScene = new THREE.Scene();
  private readonly rtScene: THREE.WebGLRenderTarget;
  private readonly rtTmp: THREE.WebGLRenderTarget;
  private readonly rtOut: THREE.WebGLRenderTarget;
  private readonly blurMat: THREE.ShaderMaterial;
  private readonly pass: THREE.Mesh;
  private readonly passCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: THREE.Mesh;
  private readonly frustum = new THREE.Frustum();
  private readonly viewProj = new THREE.Matrix4();
  private readonly windowBox = new THREE.Box3(
    new THREE.Vector3(-BAY.halfW - 0.1, BAY.sillY - 0.1, BAY.wallZ - BAY.thick - 0.2),
    new THREE.Vector3(BAY.halfW + 0.1, BAY.topY + 0.1, BAY.wallZ + 0.1)
  );
  private readonly corners: THREE.Vector3[] = [];
  private readonly clip = new THREE.Vector4();
  /** Padding (texels) around the window rectangle so the blur taps read valid pixels. */
  private pad = 8;
  private on = false;
  private texW = 0;
  private texH = 0;

  constructor(opts: GardenBlurOptions) {
    this.renderer = opts.renderer;
    this.scene = opts.scene;
    this.camera = opts.camera;
    this.garden = opts.garden;
    this.home = opts.garden.parent;
    this.gardenScene.name = 'gardenBlurScene';
    this.gardenScene.background = new THREE.Color(HAZE_HEX).convertSRGBToLinear();

    const target = (depth: boolean) =>
      new THREE.WebGLRenderTarget(1, 1, {
        type: THREE.HalfFloatType,
        format: THREE.RGBAFormat,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: depth,
        stencilBuffer: false,
        depthTexture: depth ? new THREE.DepthTexture(1, 1) : undefined,
      });
    this.rtScene = target(true);
    this.rtTmp = target(false);
    this.rtOut = target(false);

    this.blurMat = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null as THREE.Texture | null },
        tDepth: { value: this.rtScene.depthTexture },
        uDir: { value: new THREE.Vector2() },
        uProjInv: { value: this.camera.projectionMatrixInverse },
        uCamWorld: { value: this.camera.matrixWorld },
        uSigma: { value: new THREE.Vector2(SIGMA_NEAR, SIGMA_FAR) },
        uFall: { value: FALLOFF },
        uHazeZ: { value: HAZE_Z },
      },
      vertexShader: PASS_VERT,
      fragmentShader: BLUR_FRAG,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, 3, 0, -1, -1, 0, 3, -1, 0], 3));
    tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 2, 0, 0, 2, 0], 2));
    this.pass = new THREE.Mesh(tri, this.blurMat);
    this.pass.frustumCulled = false;

    const quadMat = new THREE.ShaderMaterial({
      uniforms: { tMap: { value: this.rtOut.texture } },
      vertexShader: QUAD_VERT,
      fragmentShader: QUAD_FRAG,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), quadMat);
    this.quad.name = 'gardenBlurBackdrop';
    this.quad.frustumCulled = false;
    this.quad.renderOrder = -1000;
    this.quad.matrixAutoUpdate = false;

    const { min, max } = this.windowBox;
    for (let i = 0; i < 8; i++) {
      this.corners.push(new THREE.Vector3(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z));
    }
    this.setSize(opts.width, opts.height, opts.pixelRatio);
    this.setEnabled(true);
  }

  get enabled(): boolean {
    return this.on;
  }

  /** On: the garden is drawn here and shown as the backdrop. Off: it goes back to the room and renders directly. */
  setEnabled(on: boolean): void {
    if (on === this.on) {
      return;
    }
    this.on = on;
    if (on) {
      this.gardenScene.add(this.garden);
      this.scene.add(this.quad);
    } else {
      if (this.home) {
        this.home.add(this.garden);
      } else {
        this.garden.removeFromParent();
      }
      this.quad.removeFromParent();
    }
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    const w = Math.max(2, Math.round(width * pixelRatio * SCALE));
    const h = Math.max(2, Math.round(height * pixelRatio * SCALE));
    if (w === this.texW && h === this.texH) {
      return;
    }
    this.texW = w;
    this.texH = h;
    this.rtScene.setSize(w, h);
    this.rtTmp.setSize(w, h);
    this.rtOut.setSize(w, h);
    const k = Math.max(0.5, h / REF_HEIGHT);
    (this.blurMat.uniforms['uSigma'].value as THREE.Vector2).set(SIGMA_NEAR * k, SIGMA_FAR * k);
    this.pad = Math.ceil(TAPS * SPACING * SIGMA_FAR * k) + 2;
  }

  /** Draw (and compile) the garden pass once over the whole target, whatever the camera sees. */
  precompile(): void {
    if (this.on) {
      this.draw(0, 0, this.texW, this.texH);
    }
  }

  /** Call once per frame, after the camera is final and before the main render. */
  render(): void {
    if (!this.on) {
      return;
    }
    const cam = this.camera;
    cam.updateMatrixWorld();
    this.viewProj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.viewProj);
    // the garden is only visible through the bay window: skip the work (and the backdrop) when it is out of view
    const seen = this.frustum.intersectsBox(this.windowBox);
    this.quad.visible = seen;
    if (!seen) {
      return;
    }
    // screen rectangle (target texels) of the window box
    let x0 = 1e9;
    let y0 = 1e9;
    let x1 = -1e9;
    let y1 = -1e9;
    let behind = false;
    for (const c of this.corners) {
      const v = this.clip.set(c.x, c.y, c.z, 1).applyMatrix4(this.viewProj);
      if (v.w < 0.02) {
        behind = true;
        break;
      }
      x0 = Math.min(x0, v.x / v.w);
      x1 = Math.max(x1, v.x / v.w);
      y0 = Math.min(y0, v.y / v.w);
      y1 = Math.max(y1, v.y / v.w);
    }
    if (behind) {
      this.draw(0, 0, this.texW, this.texH);
      return;
    }
    const w = this.texW;
    const h = this.texH;
    this.draw(
      Math.max(0, Math.floor((x0 * 0.5 + 0.5) * w) - 2),
      Math.max(0, Math.floor((y0 * 0.5 + 0.5) * h) - 2),
      Math.min(w, Math.ceil((x1 * 0.5 + 0.5) * w) + 2),
      Math.min(h, Math.ceil((y1 * 0.5 + 0.5) * h) + 2)
    );
  }

  private scissor(rt: THREE.WebGLRenderTarget, x0: number, y0: number, x1: number, y1: number): void {
    rt.scissor.set(x0, y0, Math.max(0, x1 - x0), Math.max(0, y1 - y0));
    rt.scissorTest = true;
  }

  /** Garden into rtScene (rect + padding), horizontal blur (rect + vertical padding), vertical blur (rect). */
  private draw(x0: number, y0: number, x1: number, y1: number): void {
    const r = this.renderer;
    const p = this.pad;
    const w = this.texW;
    const h = this.texH;
    const prev = r.getRenderTarget();
    this.scissor(this.rtScene, Math.max(0, x0 - p), Math.max(0, y0 - p), Math.min(w, x1 + p), Math.min(h, y1 + p));
    r.setRenderTarget(this.rtScene);
    r.render(this.gardenScene, this.camera);

    const u = this.blurMat.uniforms;
    u['tColor'].value = this.rtScene.texture;
    (u['uDir'].value as THREE.Vector2).set(1 / w, 0);
    this.scissor(this.rtTmp, x0, Math.max(0, y0 - p), x1, Math.min(h, y1 + p));
    r.setRenderTarget(this.rtTmp);
    r.render(this.pass, this.passCam);

    u['tColor'].value = this.rtTmp.texture;
    (u['uDir'].value as THREE.Vector2).set(0, 1 / h);
    this.scissor(this.rtOut, x0, y0, x1, y1);
    r.setRenderTarget(this.rtOut);
    r.render(this.pass, this.passCam);
    r.setRenderTarget(prev);
  }

  dispose(): void {
    this.setEnabled(false);
    this.rtScene.dispose();
    this.rtTmp.dispose();
    this.rtOut.dispose();
    this.blurMat.dispose();
    this.pass.geometry.dispose();
    this.quad.geometry.dispose();
    (this.quad.material as THREE.Material).dispose();
  }
}
