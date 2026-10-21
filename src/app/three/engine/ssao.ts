import * as THREE from 'three';

/**
 * Depth-only ambient occlusion, computed at half resolution (a third on high density screens).
 *
 * No extra scene pass: it reads the depth texture the main MSAA target already resolves (see PostFx). Three small
 * fullscreen passes: 12 normal-oriented hemisphere taps (view normal rebuilt from the depth), then a separable
 * depth-aware blur. The result (r = occlusion 1..0, g = view distance) is applied by the final shader, which also
 * does the depth-aware upsampling and keeps bright / emissive pixels and photos untouched.
 * Background pixels (cleared depth: the garden backdrop quad does not write depth) count as empty space.
 */

const SAMPLES = 12;
/** Hemisphere radius (m). */
const RADIUS = 0.6;
/** Distance (m) over which the effect fades out. */
const FADE_NEAR = 9;
const FADE_FAR = 16;

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/** GLSL shared by the occlusion and blur passes. */
const COMMON = /* glsl */ `
  uniform vec2 uNearFar;
  float linZ(float d) {
    // positive view distance from a depth buffer value
    return (uNearFar.x * uNearFar.y) / (uNearFar.y - (uNearFar.y - uNearFar.x) * d);
  }
`;

const AO_FRAG = /* glsl */ `
  uniform sampler2D tDepth;
  uniform mat4 uProj;
  uniform mat4 uProjInv;
  uniform vec2 uTexel;
  uniform float uDiv;
  uniform vec3 uKernel[${SAMPLES}];
  uniform float uRadius;
  uniform vec2 uFade;
  varying vec2 vUv;
  ${COMMON}

  vec3 viewPos(vec2 uv, float d) {
    vec4 p = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
    return p.xyz / p.w;
  }

  // interleaved gradient noise
  float ign(vec2 p) {
    return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
  }

  void main() {
    // first full-resolution texel covered by this low-resolution pixel
    vec2 uv = (floor(gl_FragCoord.xy) * uDiv + 0.5) * uTexel;
    float d = texture2D(tDepth, uv).x;
    if (d >= 0.99999) {
      gl_FragColor = vec4(1.0, 1000.0, 0.0, 1.0);
      return;
    }
    vec3 P = viewPos(uv, d);

    vec2 o = uTexel;
    vec3 Pl = viewPos(uv - vec2(o.x, 0.0), texture2D(tDepth, uv - vec2(o.x, 0.0)).x);
    vec3 Pr = viewPos(uv + vec2(o.x, 0.0), texture2D(tDepth, uv + vec2(o.x, 0.0)).x);
    vec3 Pd = viewPos(uv - vec2(0.0, o.y), texture2D(tDepth, uv - vec2(0.0, o.y)).x);
    vec3 Pu = viewPos(uv + vec2(0.0, o.y), texture2D(tDepth, uv + vec2(0.0, o.y)).x);
    vec3 dx = abs(Pr.z - P.z) < abs(P.z - Pl.z) ? Pr - P : P - Pl;
    vec3 dy = abs(Pu.z - P.z) < abs(P.z - Pd.z) ? Pu - P : P - Pd;
    vec3 cr = cross(dx, dy);
    float crl = length(cr);
    vec3 N = crl > 1e-9 ? cr / crl : vec3(0.0, 0.0, 1.0);

    float ang = 6.2831853 * ign(gl_FragCoord.xy);
    vec3 ref = abs(N.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 t0 = normalize(cross(ref, N));
    vec3 b0 = cross(N, t0);
    vec3 T = t0 * cos(ang) + b0 * sin(ang);
    vec3 B = cross(N, T);

    float bias = 0.006 + 0.004 * -P.z;
    float occ = 0.0;
    for (int i = 0; i < ${SAMPLES}; i++) {
      vec3 k = uKernel[i];
      vec3 S = P + (T * k.x + B * k.y + N * k.z) * uRadius;
      vec4 c = uProj * vec4(S, 1.0);
      float sd = texture2D(tDepth, c.xy / c.w * 0.5 + 0.5).x;
      if (sd >= 0.99999) {
        continue;
      }
      float sz = -linZ(sd);
      float range = smoothstep(0.0, 1.0, uRadius / max(abs(P.z - sz), 1e-3));
      occ += step(bias, sz - S.z) * range;
    }
    float ao = 1.0 - occ / float(${SAMPLES});
    ao = mix(1.0, max(pow(ao, 2.2), 0.3), 1.0 - smoothstep(uFade.x, uFade.y, -P.z));
    gl_FragColor = vec4(ao, -P.z, 0.0, 1.0);
  }
`;

const BLUR_FRAG = /* glsl */ `
  uniform sampler2D tAO;
  uniform vec2 uDir;
  varying vec2 vUv;

  void main() {
    vec4 c = texture2D(tAO, vUv);
    float zc = c.y;
    if (zc > 500.0) {
      gl_FragColor = c;
      return;
    }
    float tol = 1.0 / (0.04 + 0.03 * zc);
    float sum = c.x;
    float wsum = 1.0;
    for (int i = 1; i <= 4; i++) {
      float k = float(i);
      float wg = exp(-0.5 * k * k / 5.0);
      vec4 a = texture2D(tAO, vUv + uDir * k);
      vec4 b = texture2D(tAO, vUv - uDir * k);
      float da = (a.y - zc) * tol;
      float db = (b.y - zc) * tol;
      float wa = wg * exp(-da * da);
      float wb = wg * exp(-db * db);
      sum += a.x * wa + b.x * wb;
      wsum += wa + wb;
    }
    gl_FragColor = vec4(sum / wsum, zc, 0.0, 1.0);
  }
`;

export class Ssao {
  private readonly rtA: THREE.WebGLRenderTarget;
  private readonly rtB: THREE.WebGLRenderTarget;
  private readonly aoMat: THREE.ShaderMaterial;
  private readonly blurMat: THREE.ShaderMaterial;
  private readonly mesh: THREE.Mesh;
  private readonly cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private w = 0;
  private h = 0;

  constructor(camera: THREE.PerspectiveCamera) {
    const target = () =>
      new THREE.WebGLRenderTarget(1, 1, {
        type: THREE.HalfFloatType,
        format: THREE.RGBAFormat,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        depthBuffer: false,
        stencilBuffer: false,
      });
    this.rtA = target();
    this.rtB = target();

    const kernel: THREE.Vector3[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const u = (i + 0.5) / SAMPLES;
      const r = Math.sqrt(u);
      const phi = i * 2.399963;
      // distances from ~5 cm (contact shading of frames, shelves, hardware) up to the full radius
      const s = 0.08 + 0.92 * Math.pow((i + 1) / SAMPLES, 2);
      kernel.push(new THREE.Vector3(Math.cos(phi) * r * s, Math.sin(phi) * r * s, Math.sqrt(1 - u) * s));
    }
    const nearFar = new THREE.Vector2(camera.near, camera.far);
    this.aoMat = new THREE.ShaderMaterial({
      uniforms: {
        tDepth: { value: null as THREE.Texture | null },
        uProj: { value: camera.projectionMatrix },
        uProjInv: { value: camera.projectionMatrixInverse },
        uTexel: { value: new THREE.Vector2(1, 1) },
        uDiv: { value: 2 },
        uNearFar: { value: nearFar },
        uKernel: { value: kernel },
        uRadius: { value: RADIUS },
        uFade: { value: new THREE.Vector2(FADE_NEAR, FADE_FAR) },
      },
      vertexShader: VERT,
      fragmentShader: AO_FRAG,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.blurMat = new THREE.ShaderMaterial({
      uniforms: {
        tAO: { value: null as THREE.Texture | null },
        uDir: { value: new THREE.Vector2() },
      },
      vertexShader: VERT,
      fragmentShader: BLUR_FRAG,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, 3, 0, -1, -1, 0, 3, -1, 0], 3));
    tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 2, 0, 0, 2, 0], 2));
    this.mesh = new THREE.Mesh(tri, this.aoMat);
    this.mesh.frustumCulled = false;
  }

  /** Half-resolution result: r = occlusion (1 = open), g = view distance (m, 1000 = background). */
  get texture(): THREE.Texture {
    return this.rtA.texture;
  }

  get width(): number {
    return this.w;
  }

  get height(): number {
    return this.h;
  }

  /** `width` / `height`: size of the depth buffer in pixels; the occlusion is computed at 1 / `div` of it. */
  setSize(width: number, height: number, div = 2): void {
    const w = Math.max(2, Math.ceil(width / div));
    const h = Math.max(2, Math.ceil(height / div));
    this.aoMat.uniforms['uDiv'].value = div;
    (this.aoMat.uniforms['uTexel'].value as THREE.Vector2).set(1 / Math.max(1, Math.floor(width)), 1 / Math.max(1, Math.floor(height)));
    if (w === this.w && h === this.h) {
      return;
    }
    this.w = w;
    this.h = h;
    this.rtA.setSize(w, h);
    this.rtB.setSize(w, h);
  }

  render(renderer: THREE.WebGLRenderer, depth: THREE.Texture): void {
    const prev = renderer.getRenderTarget();
    const m = this.mesh;
    m.material = this.aoMat;
    this.aoMat.uniforms['tDepth'].value = depth;
    renderer.setRenderTarget(this.rtA);
    renderer.render(m, this.cam);

    m.material = this.blurMat;
    const u = this.blurMat.uniforms;
    u['tAO'].value = this.rtA.texture;
    (u['uDir'].value as THREE.Vector2).set(1 / this.w, 0);
    renderer.setRenderTarget(this.rtB);
    renderer.render(m, this.cam);
    u['tAO'].value = this.rtB.texture;
    (u['uDir'].value as THREE.Vector2).set(0, 1 / this.h);
    renderer.setRenderTarget(this.rtA);
    renderer.render(m, this.cam);
    renderer.setRenderTarget(prev);
  }

  dispose(): void {
    this.rtA.dispose();
    this.rtB.dispose();
    this.aoMat.dispose();
    this.blurMat.dispose();
    this.mesh.geometry.dispose();
  }
}
