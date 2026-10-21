import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment';
import {
  CreateStudioScene,
  DecorFrame,
  HeroFrame,
  Hotspot,
  HotspotScreenPos,
  PhotoCategory,
  StationId,
  StudioRoom,
  StudioSceneApi,
  StudioSceneOptions,
  STATION_ORDER,
} from './studio.types';
import { buildStudioRoom } from './studio-room';
import {
  CameraRig,
  RigPose,
  clamp,
  easeInOutCubic,
  easeOutCubic,
  makePose,
  smoothstep,
} from './engine/camera-rig';
import { Photo, TextureStore } from './engine/texture-store';
import { PostFx } from './engine/postfx';
import { GardenBlur } from './engine/garden-blur';
import { FrameGovernor } from './engine/governor';

const CATEGORIES: PhotoCategory[] = ['portraits', 'macros', 'graphistes'];
const UP = new THREE.Vector3(0, 1, 0);
/** Vertical field of view used when a photo fills the screen. */
const GALLERY_FOV = 34;
/** Share of the available viewport the photo should fill in the slideshow. */
const GALLERY_FILL = 0.82;
const FADE = 0.6;
const MORPH = 0.5;
const INTRO = 2.8;
const READY_MIN = 0.6;
const READY_CAP = 6;
/** Overview only: lens shift (share of the viewport height) that lifts the room above the HTML title block. */
const OVERVIEW_LIFT = 0.2;
/** Mouse parallax limits (meters / radians at the screen edge). */
const PARALLAX_POS_X = 0.06;
const PARALLAX_POS_Y = 0.03;
const PARALLAX_YAW = 0.036;
const PARALLAX_PITCH = 0.024;

interface HeroState {
  hero: HeroFrame;
  back: THREE.MeshBasicMaterial;
  front: THREE.MeshBasicMaterial;
  landing: Photo | null;
  backPhoto: Photo | null;
  frontPhoto: Photo | null;
  /** Aspect currently applied to the frame. */
  aspect: number;
  morph: { from: number; to: number; t: number; dur: number } | null;
  fade: { t: number; dur: number } | null;
  waiters: Array<() => void>;
  token: number;
}

interface DecorFade {
  mat: THREE.MeshBasicMaterial;
  t: number;
}

/** Cover-crop a texture so an image of `imageAspect` fills a frame of `frameAspect`. */
const cover = (texture: THREE.Texture, imageAspect: number, frameAspect: number): void => {
  if (imageAspect > frameAspect) {
    const rx = frameAspect / imageAspect;
    texture.repeat.set(rx, 1);
    texture.offset.set((1 - rx) / 2, 0);
  } else {
    const ry = imageAspect / frameAspect;
    texture.repeat.set(1, ry);
    texture.offset.set(0, (1 - ry) / 2);
  }
};

const idle = (fn: () => void): void => {
  const w = window as any;
  if (typeof w.requestIdleCallback === 'function') {
    w.requestIdleCallback(fn, { timeout: 1500 });
  } else {
    setTimeout(fn, 150);
  }
};

const createRenderer = (canvas: HTMLCanvasElement): THREE.WebGLRenderer => {
  try {
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    if (!renderer.getContext()) {
      throw new Error('no context');
    }
    return renderer;
  } catch (err) {
    throw new Error('WebGL is not available: ' + (err instanceof Error ? err.message : String(err)));
  }
};

export const createStudioScene: CreateStudioScene = (options: StudioSceneOptions): StudioSceneApi => {
  const canvas = options.canvas;

  /* ------------------------------------------------------------------ */
  /* Environment flags                                                   */
  /* ------------------------------------------------------------------ */
  const reducedQuery = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;
  let reduced = !!reducedQuery && reducedQuery.matches;
  const onReducedChange = (e: MediaQueryListEvent) => {
    reduced = e.matches;
  };
  if (reducedQuery && reducedQuery.addEventListener) {
    reducedQuery.addEventListener('change', onReducedChange);
  }

  const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const quality: 'high' | 'low' = options.quality
    || (coarse || window.innerWidth < 700 || (navigator.hardwareConcurrency || 8) <= 4 ? 'low' : 'high');

  /* ------------------------------------------------------------------ */
  /* Renderer / scene                                                    */
  /* ------------------------------------------------------------------ */
  const renderer = createRenderer(canvas);
  // High quality renders through a half-float MSAA composer: 1.5x is plenty and keeps retina laptops comfortable.
  const maxPixelRatio = quality === 'low' ? 1.25 : 1.5;
  let pixelRatio = Math.min(window.devicePixelRatio || 1, maxPixelRatio);
  renderer.setPixelRatio(pixelRatio);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.88;
  renderer.shadowMap.enabled = quality === 'high';
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  canvas.style.display = 'block';
  if (!canvas.style.width) {
    canvas.style.width = '100%';
  }
  if (!canvas.style.height) {
    canvas.style.height = '100%';
  }

  const scene = new THREE.Scene();
  const bg = new THREE.Color(0x0d0a08);
  scene.background = bg;
  // Very light warm-dark haze: gives depth to the far end of the room without lifting the blacks.
  scene.fog = new THREE.FogExp2(0x1a120c, 0.022);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new RoomEnvironment();
  const envTarget = pmrem.fromScene(envScene, 0.04);
  scene.environment = envTarget.texture;
  envScene.dispose();

  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 80);
  const rig = new CameraRig();

  let room: StudioRoom;
  try {
    room = buildStudioRoom({ quality, renderer });
  } catch (err) {
    renderer.dispose();
    throw err;
  }
  scene.add(room.root);

  // The room ships PBR materials with the default env intensity; RoomEnvironment is very bright, so keep the IBL a
  // quiet fill (lights stay in charge). Metals / clearcoat keep a bit more so they still read as reflective.
  room.root.traverse((obj) => {
    const mat = (obj as THREE.Mesh).material;
    const list = Array.isArray(mat) ? mat : mat ? [mat] : [];
    list.forEach((m) => {
      const std = m as THREE.MeshPhysicalMaterial;
      if (std.isMeshStandardMaterial && !std.envMap && std.envMapIntensity === 1) {
        std.envMapIntensity = std.metalness > 0.5 ? 0.5 : (std.clearcoat || 0) > 0.3 ? 0.34 : 0.17;
      }
    });
  });

  /* ------------------------------------------------------------------ */
  /* Geometry helpers                                                    */
  /* ------------------------------------------------------------------ */
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const tmpC = new THREE.Vector3();
  const tmpD = new THREE.Vector3();

  const toPose = (id: StationId): RigPose => {
    const s = room.stations[id];
    const pose = makePose();
    pose.position.fromArray(s.position);
    pose.target.fromArray(s.target);
    pose.fov = s.fov;
    return pose;
  };

  /** Box the camera should stay in: every station + typical slideshow spots, slightly expanded. */
  const roomBox = new THREE.Box3();
  STATION_ORDER.forEach((id) => roomBox.expandByPoint(tmpA.fromArray(room.stations[id].position)));
  CATEGORIES.forEach((c) => {
    const h = room.heroFrames[c];
    roomBox.expandByPoint(tmpA.fromArray(h.center).addScaledVector(tmpB.fromArray(h.normal), 2));
  });
  roomBox.min.add(tmpA.set(-0.2, -0.1, -0.2));
  roomBox.max.add(tmpA.set(0.2, 0.35, 0.2));
  const moveBox = new THREE.Box3();

  /* ------------------------------------------------------------------ */
  /* Viewport + view inset                                               */
  /* ------------------------------------------------------------------ */
  let viewW = 1;
  let viewH = 1;
  /** Bloom + lens pipeline (high quality only; direct render otherwise). */
  let post: PostFx | null = null;
  /** Depth of field for the garden outside the bay window (needs the composer). */
  let gardenBlur: GardenBlur | null = null;
  const inset = { left: 0, right: 0, top: 0, bottom: 0 };
  const insetTarget = { left: 0, right: 0, top: 0, bottom: 0 };

  const resize = () => {
    const parent = canvas.parentElement;
    const w = Math.max(1, Math.round(canvas.clientWidth || (parent && parent.clientWidth) || window.innerWidth));
    const h = Math.max(1, Math.round(canvas.clientHeight || (parent && parent.clientHeight) || window.innerHeight));
    viewW = w;
    viewH = h;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (post) {
      post.setSize(w, h, pixelRatio);
    }
    if (gardenBlur) {
      gardenBlur.setSize(w, h, pixelRatio);
    }
  };

  /* ------------------------------------------------------------------ */
  /* Textures                                                            */
  /* ------------------------------------------------------------------ */
  const store = new TextureStore(renderer, 8);
  const decorMats = new Map<THREE.Mesh, THREE.MeshBasicMaterial>();
  const decorGeos = new Map<THREE.Mesh, { geometry: THREE.BufferGeometry; uv: Float32Array }>();
  const decorFades: DecorFade[] = [];
  let decorUrls = new Set<string>();
  let decorToken = 0;

  const heroes = {} as Record<PhotoCategory, HeroState>;
  CATEGORIES.forEach((c) => {
    const hero = room.heroFrames[c];
    const back = hero.photoMeshes[0].material as THREE.MeshBasicMaterial;
    const front = hero.photoMeshes[1].material as THREE.MeshBasicMaterial;
    back.transparent = true;
    front.transparent = true;
    back.opacity = 1;
    back.color.setHex(0x16130f); // placeholder until the first photo arrives
    front.opacity = 0;
    front.visible = false;
    const size = hero.getPhotoSize();
    heroes[c] = {
      hero,
      back,
      front,
      landing: null,
      backPhoto: null,
      frontPhoto: null,
      aspect: size.height > 0 ? size.width / size.height : 1.4,
      morph: null,
      fade: null,
      waiters: [],
      token: 0,
    };
  });

  store.isInUse = (texture) => {
    for (const c of CATEGORIES) {
      const st = heroes[c];
      if (st.back.map === texture || st.front.map === texture) {
        return true;
      }
    }
    let used = false;
    decorMats.forEach((m) => {
      if (m.map === texture) {
        used = true;
      }
    });
    return used;
  };

  const assignMap = (mat: THREE.MeshBasicMaterial, texture: THREE.Texture | null) => {
    if (mat.map !== texture) {
      mat.map = texture;
      mat.needsUpdate = true;
    }
  };

  const fadeDuration = (d: number) => (reduced ? 0.15 : d);

  /* ----- hero frames ------------------------------------------------ */

  const flushWaiters = (st: HeroState) => {
    const list = st.waiters.splice(0);
    list.forEach((fn) => fn());
  };

  const cropHero = (st: HeroState) => {
    if (st.backPhoto) {
      cover(st.backPhoto.texture, st.backPhoto.aspect, st.aspect);
    }
    if (st.frontPhoto) {
      cover(st.frontPhoto.texture, st.frontPhoto.aspect, st.aspect);
    }
  };

  const setAspect = (st: HeroState, aspect: number) => {
    st.aspect = aspect;
    st.hero.setPhotoAspect(aspect);
    cropHero(st);
  };

  const morphTo = (st: HeroState, aspect: number, dur: number) => {
    if (Math.abs(aspect - st.aspect) < 1e-3) {
      st.morph = null;
      return;
    }
    if (reduced || dur <= 0) {
      st.morph = null;
      setAspect(st, aspect);
      return;
    }
    st.morph = { from: st.aspect, to: aspect, t: 0, dur };
  };

  /** Front plane becomes the back plane (instant, invisible: front is fully opaque at that point). */
  const commitFront = (st: HeroState) => {
    if (st.frontPhoto) {
      assignMap(st.back, st.frontPhoto.texture);
      st.back.color.setScalar(1);
      st.back.opacity = 1;
      st.backPhoto = st.frontPhoto;
      // Keep the hidden front plane on a protected texture so eviction can never dispose a used one.
      st.front.opacity = 0;
      st.front.visible = false;
      st.frontPhoto = null;
    }
    st.fade = null;
    flushWaiters(st);
  };

  const currentPhoto = (st: HeroState): Photo | null => st.frontPhoto || st.backPhoto;

  /** Cross-fade the hero frame to `photo`, morphing the frame to `aspect`. Waiter resolves when done. */
  const displayHero = (st: HeroState, photo: Photo, aspect: number, onDone?: () => void) => {
    if (st.fade) {
      commitFront(st);
    }
    if (currentPhoto(st) === photo) {
      morphTo(st, aspect, MORPH);
      if (onDone) {
        onDone();
      }
      return;
    }
    if (onDone) {
      st.waiters.push(onDone);
    }
    assignMap(st.front, photo.texture);
    st.front.color.setScalar(1);
    st.front.opacity = 0;
    st.front.visible = true;
    st.frontPhoto = photo;
    st.fade = { t: 0, dur: fadeDuration(FADE) };
    if (!st.backPhoto && !gallery) {
      // First appearance on the wall: no morph from the placeholder.
      st.morph = null;
      setAspect(st, aspect);
    } else {
      morphTo(st, aspect, MORPH);
    }
    cropHero(st);
  };

  const landingAspect = (photo: Photo) => clamp(photo.aspect, 0.6, 1.8);
  const galleryAspect = (photo: Photo) => clamp(photo.aspect, 0.4, 3);

  const showLanding = (st: HeroState) => {
    if (st.landing) {
      displayHero(st, st.landing, landingAspect(st.landing));
    }
  };

  const updateHero = (st: HeroState, dt: number) => {
    if (st.morph) {
      const m = st.morph;
      m.t += dt / m.dur;
      const k = easeInOutCubic(Math.min(1, m.t));
      const a = Math.exp(Math.log(m.from) + (Math.log(m.to) - Math.log(m.from)) * k);
      if (m.t >= 1) {
        st.morph = null;
        setAspect(st, m.to);
      } else {
        setAspect(st, a);
      }
    }
    if (st.fade) {
      st.fade.t += dt / st.fade.dur;
      st.front.opacity = smoothstep(st.fade.t);
      if (st.fade.t >= 1) {
        commitFront(st);
      }
    }
  };

  /* ----- decor frames ------------------------------------------------ */

  const cropDecor = (mesh: THREE.Mesh, imageAspect: number, frameAspect: number) => {
    let entry = decorGeos.get(mesh);
    if (!entry) {
      const attr = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute | undefined;
      if (!attr) {
        return;
      }
      // Frames may share one geometry: give this one its own copy before editing UVs.
      const geometry = mesh.geometry.clone();
      entry = { geometry, uv: Float32Array.from(attr.array as ArrayLike<number>) };
      mesh.geometry = geometry;
      decorGeos.set(mesh, entry);
    }
    let rx = 1;
    let ry = 1;
    if (imageAspect > frameAspect) {
      rx = frameAspect / imageAspect;
    } else {
      ry = imageAspect / frameAspect;
    }
    const ox = (1 - rx) / 2;
    const oy = (1 - ry) / 2;
    const uv = entry.geometry.getAttribute('uv') as THREE.BufferAttribute;
    const orig = entry.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, ox + orig[i * 2] * rx, oy + orig[i * 2 + 1] * ry);
    }
    uv.needsUpdate = true;
  };

  const applyDecor = (frame: DecorFrame, photo: Photo) => {
    const mesh = frame.photoMesh;
    let mat = decorMats.get(mesh);
    if (!mat) {
      // Own the material: the room may share one instance between frames.
      mat = (mesh.material as THREE.MeshBasicMaterial).clone();
      mesh.material = mat;
      decorMats.set(mesh, mat);
    }
    assignMap(mat, photo.texture);
    mat.needsUpdate = true;
    cropDecor(mesh, photo.aspect, frame.aspect || 1);
    const fade = decorFades.find((f) => f.mat === mat);
    if (fade) {
      fade.t = 0;
    } else {
      decorFades.push({ mat, t: 0 });
    }
    mat.color.setScalar(0);
  };

  const updateDecorFades = (dt: number) => {
    for (let i = decorFades.length - 1; i >= 0; i--) {
      const f = decorFades[i];
      f.t += dt / fadeDuration(FADE);
      f.mat.color.setScalar(smoothstep(f.t));
      if (f.t >= 1) {
        f.mat.color.setScalar(1);
        decorFades.splice(i, 1);
      }
    }
  };

  /* ------------------------------------------------------------------ */
  /* Loading progress + readiness                                        */
  /* ------------------------------------------------------------------ */
  const startedAt = performance.now();
  let ready = false;
  let firstFrame = false;
  let tasksTotal = 0;
  let tasksDone = 0;
  let lastProgress = -1;

  const reportProgress = () => {
    let ratio: number;
    if (ready) {
      ratio = 1;
    } else {
      const base = firstFrame ? 0.15 : 0.05;
      const tasks = tasksTotal > 0 ? tasksDone / tasksTotal : 0;
      ratio = Math.min(0.99, base + (1 - base) * tasks);
    }
    if (ratio !== lastProgress) {
      lastProgress = ratio;
      options.onProgress(ratio);
    }
  };

  const track = (promise: Promise<unknown>) => {
    if (ready) {
      return;
    }
    tasksTotal++;
    const done = () => {
      tasksDone++;
      reportProgress();
    };
    promise.then(done, done);
    reportProgress();
  };

  /* ------------------------------------------------------------------ */
  /* Camera control state                                                */
  /* ------------------------------------------------------------------ */
  let currentStation: StationId = 'overview';
  let gallery: { st: HeroState; category: PhotoCategory } | null = null;
  let galleryBlend = 0;
  let galleryBlendTarget = 0;
  const focus = { value: 0, target: 0, category: 'portraits' as PhotoCategory };

  const insetAvailable = () => ({
    w: Math.max(120, viewW - inset.left - inset.right),
    h: Math.max(120, viewH - inset.top - inset.bottom),
  });

  const galleryPose = (st: HeroState): RigPose => {
    const hero = st.hero;
    const aspect = st.aspect;
    const pw = Math.min(hero.maxWidth, hero.maxHeight * aspect) * 1.04;
    const ph = (pw / aspect);
    const avail = insetAvailable();
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(GALLERY_FOV) / 2);
    const dV = ph / (GALLERY_FILL * (avail.h / viewH) * 2 * tanHalf);
    const dH = pw / (GALLERY_FILL * (avail.w / viewW) * 2 * tanHalf * (viewW / viewH));
    const dist = clamp(Math.max(dV, dH), 0.5, 4.5);
    const pose = makePose();
    pose.target.fromArray(hero.center);
    pose.position.fromArray(hero.center).addScaledVector(tmpC.fromArray(hero.normal), dist);
    pose.fov = GALLERY_FOV;
    return pose;
  };

  const desiredPose = (): RigPose => (gallery ? galleryPose(gallery.st) : toPose(currentStation));

  const introFrom = (to: RigPose): RigPose => {
    const from = makePose();
    if (currentStation === 'overview' && !gallery) {
      // the arrival is a dolly BACK and up from deeper in the room (the lighting set stands behind the overview camera):
      // the walls open out as the camera settles
      from.position.set(to.position.x + 0.1, to.position.y - 0.6, to.position.z - 2.6);
      from.target.copy(to.target).addScaledVector(UP, -0.05);
      from.fov = to.fov - 6;
      return from;
    }
    tmpD.subVectors(to.position, to.target);
    if (tmpD.lengthSq() < 1e-6) {
      tmpD.set(0, 0, 1);
    }
    tmpD.normalize();
    from.position.copy(to.position).addScaledVector(tmpD, 0.9).addScaledVector(UP, 0.9);
    from.target.copy(to.target).addScaledVector(UP, 0.25);
    from.fov = to.fov + 8;
    return from;
  };

  const moveDuration = (from: THREE.Vector3, fromTarget: THREE.Vector3, to: RigPose) => {
    const dist = from.distanceTo(to.position) + 0.5 * fromTarget.distanceTo(to.target);
    return clamp(1.15 + 0.2 * dist, 1.4, 1.8);
  };

  /** Fly to whatever the current state says the camera should show. */
  const flyToDesired = () => {
    const pose = desiredPose();
    if (!ready) {
      rig.snapTo(introFrom(pose));
      return;
    }
    if (reduced) {
      rig.snapTo(pose);
      return;
    }
    moveBox.copy(roomBox).expandByPoint(rig.position).expandByPoint(pose.position);
    rig.moveTo(pose, {
      duration: moveDuration(rig.position, rig.target, pose),
      bounds: moveBox,
    });
  };

  const startIntro = () => {
    const pose = desiredPose();
    if (reduced) {
      rig.snapTo(pose);
      return;
    }
    rig.moveTo(pose, {
      duration: INTRO,
      from: introFrom(pose),
      lift: 0,
      ease: easeOutCubic,
    });
  };

  /* ------------------------------------------------------------------ */
  /* Input                                                               */
  /* ------------------------------------------------------------------ */
  const hotspots: Hotspot[] = [];
  CATEGORIES.forEach((c) => hotspots.push(room.heroFrames[c]));
  room.extraHotspots.forEach((h) => hotspots.push(h));
  const pickObjects: THREE.Object3D[] = [];
  const pickOwner = new Map<THREE.Object3D, Hotspot>();
  hotspots.forEach((h) => {
    h.pick.forEach((o) => {
      pickObjects.push(o);
      pickOwner.set(o, h);
    });
  });
  const highlight = hotspots.map(() => 0);
  const anchors = hotspots.map((h) => new THREE.Vector3().fromArray(h.anchor));
  const screen: HotspotScreenPos[] = hotspots.map((h) => ({ id: h.id, x: 0, y: 0, visible: false }));

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  const pointer = { tx: 0, ty: 0, x: 0, y: 0, clientX: 0, clientY: 0, over: false, touch: false, moved: false };
  let hoverId: StationId | null = null;
  /** Station hovered from the HTML UI (dock button / label): lights the matching object. */
  let hoverHint: StationId | null = null;
  let picked: Hotspot | null = null;
  let lastPickAt = -1;
  let down: { x: number; y: number; t: number } | null = null;

  const ownerOf = (object: THREE.Object3D): Hotspot | null => {
    for (let o: THREE.Object3D | null = object; o; o = o.parent) {
      const owner = pickOwner.get(o);
      if (owner) {
        return owner;
      }
    }
    return null;
  };

  /** Invisible generous hit volume (material.visible = false): the room builds them around each object. */
  const isVolume = (mat: THREE.Material | undefined): boolean => !!mat && mat.visible === false;

  /** A real, drawn surface: not a glow / shadow decal (transparent + no depth write) and not hidden. */
  const isSolid = (object: THREE.Object3D, mat: THREE.Material | undefined): boolean => {
    if (!(object as THREE.Mesh).isMesh || !mat || !mat.visible) {
      return false;
    }
    if (mat.transparent && (!mat.depthWrite || mat.opacity <= 0.02)) {
      return false;
    }
    for (let o: THREE.Object3D | null = object; o; o = o.parent) {
      if (!o.visible) {
        return false;
      }
    }
    return true;
  };

  /**
   * Hotspot under a client point. The rays only test the hotspots' pick lists (real meshes + invisible volumes).
   * A real surface always beats a volume, wherever the volume sits along the ray: otherwise a big volume in front of
   * an object (the lighting set seen from the overview) would swallow the object behind it. Without a real hit the
   * nearest volume wins.
   */
  const pickAt = (clientX: number, clientY: number): Hotspot | null => {
    const r = canvas.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) {
      return null;
    }
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(pickObjects, true);
    let volume: Hotspot | null = null;
    for (const hit of hits) {
      const owner = ownerOf(hit.object);
      if (!owner) {
        continue;
      }
      const material = (hit.object as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      const mat = Array.isArray(material) ? material[hit.face && hit.face.materialIndex || 0] : material;
      if (isVolume(mat)) {
        volume = volume || owner;
      } else if (isSolid(hit.object, mat)) {
        return owner;
      }
    }
    return volume;
  };

  const setHover = (id: StationId | null) => {
    if (id === hoverId) {
      return;
    }
    hoverId = id;
    canvas.style.cursor = id ? 'pointer' : '';
    options.onHover(id);
  };

  const onPointerMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) {
      return;
    }
    const nx = (e.clientX - r.left) / r.width;
    const ny = (e.clientY - r.top) / r.height;
    pointer.tx = clamp(nx * 2 - 1, -1, 1);
    pointer.ty = clamp(-(ny * 2 - 1), -1, 1);
    pointer.clientX = e.clientX;
    pointer.clientY = e.clientY;
    pointer.touch = e.pointerType === 'touch';
    pointer.over = e.target === canvas && nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1;
    pointer.moved = true;
  };

  const onPointerLeave = () => {
    pointer.over = false;
    pointer.tx = 0;
    pointer.ty = 0;
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) {
      return;
    }
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
  };

  const onPointerUp = (e: PointerEvent) => {
    const start = down;
    down = null;
    if (!start || e.button !== 0) {
      return;
    }
    const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
    if (moved >= 6 || performance.now() - start.t >= 400) {
      return;
    }
    const hit = pickAt(e.clientX, e.clientY);
    if (hit) {
      options.onHotspotClick(hit.id);
    }
  };

  const onPointerCancel = () => {
    down = null;
  };

  window.addEventListener('pointermove', onPointerMove, { passive: true });
  document.documentElement.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);

  const onContextLost = (e: Event) => e.preventDefault();
  canvas.addEventListener('webglcontextlost', onContextLost);

  /* ------------------------------------------------------------------ */
  /* Per-frame camera                                                    */
  /* ------------------------------------------------------------------ */
  const par = { x: 0, y: 0 };
  const dir = new THREE.Vector3();
  const right = new THREE.Vector3();
  const upv = new THREE.Vector3();
  const finalPos = new THREE.Vector3();
  const finalTarget = new THREE.Vector3();
  let time = 0;
  /** 0..1 blend of the slow 'about' camera drift. */
  let drift = 0;
  /** Current overview lens shift (share of the viewport height). */
  let lift = 0;

  /** Dev-only camera freeze (see window.__studio.look). Null in normal operation. */
  let lookOverride: { pos: THREE.Vector3; target: THREE.Vector3; fov: number } | null = null;

  const applyCamera = (dt: number) => {
    if (lookOverride) {
      camera.position.copy(lookOverride.pos);
      camera.lookAt(lookOverride.target);
      camera.fov = lookOverride.fov;
      camera.aspect = viewW / viewH;
      if (camera.view && camera.view.enabled) {
        camera.clearViewOffset();
      }
      camera.updateProjectionMatrix();
      return;
    }
    // Parallax (damped).
    const pk = 1 - Math.exp(-3.2 * dt);
    par.x += (pointer.tx - par.x) * pk;
    par.y += (pointer.ty - par.y) * pk;
    const amp = reduced ? 0 : 1 - 0.6 * galleryBlend;
    const px = par.x * amp;
    const py = par.y * amp;

    finalPos.copy(rig.position);
    finalTarget.copy(rig.target);
    let fov = rig.fov;

    // Narrow / portrait viewports: pull back and widen so the subject is not cropped.
    const aspect = viewW / viewH;
    const comp = clamp((1.2 - aspect) / 0.7, 0, 1) * (1 - galleryBlend);
    if (comp > 0) {
      finalPos.sub(finalTarget).multiplyScalar(1 + 0.7 * comp).add(finalTarget);
      roomBox.clampPoint(finalPos, finalPos);
      // the overview is the widest shot of the room: give it a little more on narrow screens
      fov = Math.min(76, fov + (currentStation === 'overview' && !gallery ? 26 : 18) * comp);
    }

    // 'about': slow cinematic drift (a gentle orbit + dolly around the monitor), off for reduced motion / while travelling
    const driftWant = !reduced && !gallery && currentStation === 'about' && !rig.moving ? 1 : 0;
    drift += (driftWant - drift) * (1 - Math.exp(-1.1 * dt));
    if (drift > 0.001) {
      dir.subVectors(finalTarget, finalPos).normalize();
      right.crossVectors(dir, UP).normalize();
      const sway = Math.sin(time * 0.16) * drift;
      const lift = Math.sin(time * 0.11 + 1.3) * drift;
      finalPos
        .addScaledVector(right, sway * 0.34)
        .addScaledVector(dir, sway * 0.12)
        .addScaledVector(UP, lift * 0.05);
    }

    // Idle motion: parallax + very slow breathing.
    dir.subVectors(finalTarget, finalPos);
    const len = dir.length() || 1;
    dir.divideScalar(len);
    right.crossVectors(dir, UP);
    if (right.lengthSq() < 1e-6) {
      right.set(1, 0, 0);
    }
    right.normalize();
    upv.crossVectors(right, dir).normalize();
    const breathe = reduced ? 0 : 1;
    finalPos
      .addScaledVector(right, px * PARALLAX_POS_X)
      .addScaledVector(upv, py * PARALLAX_POS_Y + Math.sin(time * 0.4) * 0.006 * breathe)
      .addScaledVector(dir, Math.sin(time * 0.27) * 0.012 * breathe);
    dir.applyAxisAngle(UP, -px * PARALLAX_YAW).applyAxisAngle(right, py * PARALLAX_PITCH);
    finalTarget.copy(finalPos).addScaledVector(dir, len);

    camera.position.copy(finalPos);
    camera.lookAt(finalTarget);
    camera.fov = fov;
    camera.aspect = viewW / viewH;

    // View inset: keep the subject centred in the area not covered by HTML panels.
    const ik = reduced ? 1 : 1 - Math.exp(-7 * dt);
    const liftTarget = currentStation === 'overview' && !gallery ? OVERVIEW_LIFT : 0;
    lift += (liftTarget - lift) * (reduced ? 1 : 1 - Math.exp(-3 * dt));
    if (Math.abs(liftTarget - lift) < 0.0005) {
      lift = liftTarget;
    }
    if (post) {
      post.setShade(lift / OVERVIEW_LIFT);
    }
    let active = lift !== 0;
    (['left', 'right', 'top', 'bottom'] as const).forEach((k) => {
      const diff = insetTarget[k] - inset[k];
      inset[k] = Math.abs(diff) < 0.05 ? insetTarget[k] : inset[k] + diff * ik;
      if (inset[k] !== 0) {
        active = true;
      }
    });
    if (active) {
      const cx = (inset.left - inset.right) / 2;
      const cy = (inset.top - inset.bottom - lift * viewH) / 2;
      camera.setViewOffset(viewW, viewH, -cx, -cy, viewW, viewH);
    } else if (camera.view && camera.view.enabled) {
      camera.clearViewOffset();
    }
    camera.updateProjectionMatrix();
  };

  /* ------------------------------------------------------------------ */
  /* Frame loop                                                          */
  /* ------------------------------------------------------------------ */
  let last = performance.now();
  let disposed = false;
  let prevFrameAt = performance.now();

  const updateFocus = (dt: number) => {
    if (focus.value === focus.target) {
      return;
    }
    const step = reduced ? 1 : dt / 1.0;
    focus.value = focus.value < focus.target
      ? Math.min(focus.target, focus.value + step)
      : Math.max(focus.target, focus.value - step);
    const k = smoothstep(focus.value);
    room.setFocusMode(k, focus.category);
    if (post) {
      post.setFocus(k);
    }
  };

  const updateHover = (dt: number) => {
    // Hover feedback only invites a move: none during the slideshow, none on the object that already has the focus.
    // (The object still blocks whatever sits behind it: the pick is resolved first, then discarded.)
    let hover: Hotspot | null = null;
    if (pointer.over && !pointer.touch && !gallery) {
      // the real meshes are heavy to raycast: re-pick on pointer moves, and at 20 Hz while the camera drifts
      if (pointer.moved || time - lastPickAt > 0.05) {
        pointer.moved = false;
        lastPickAt = time;
        picked = pickAt(pointer.clientX, pointer.clientY);
      }
      hover = picked && picked.id !== currentStation ? picked : null;
    } else {
      picked = null;
      lastPickAt = -1;
    }
    setHover(hover ? hover.id : null);
    const hk = 1 - Math.exp(-10 * dt);
    // A hovered dock button / HTML label lights its object too (same rules: not the focused one, not in slideshow)
    const hint = hoverHint && hoverHint !== currentStation && !gallery ? hoverHint : null;
    hotspots.forEach((h, i) => {
      const target = hoverId === h.id || hint === h.id ? 1 : 0;
      highlight[i] += (target - highlight[i]) * hk;
      if (target === 0 && highlight[i] < 0.002) {
        highlight[i] = 0;
      }
      h.setHighlight(highlight[i]);
    });
  };

  const projectHotspots = () => {
    // anchors just outside the viewport keep their label, pulled inside so the pill is never cut by the screen edge
    const margin = Math.min(56, viewW * 0.08);
    const padX = Math.min(112, viewW * 0.15);
    const padY = 20;
    for (let i = 0; i < hotspots.length; i++) {
      const v = tmpA.copy(anchors[i]).applyMatrix4(camera.matrixWorldInverse);
      const inFront = v.z < 0;
      v.applyMatrix4(camera.projectionMatrix);
      const x = (v.x * 0.5 + 0.5) * viewW;
      const y = (-v.y * 0.5 + 0.5) * viewH;
      const s = screen[i];
      s.visible = inFront && x > -margin && x < viewW + margin && y > -margin && y < viewH + margin;
      s.x = s.visible ? clamp(x, padX, viewW - padX) : x;
      s.y = s.visible ? clamp(y, padY, viewH - padY) : y;
    }
    options.onHotspots(screen);
  };

  /* ----- adaptive quality governor: ambient occlusion -> pixel ratio -> bloom -> shadows / extra lights -> ... -> garden blur, never back up ----- */
  const governor = new FrameGovernor([
    {
      name: 'ambient occlusion off',
      apply: () => {
        if (!post || !post.aoEnabled) {
          return false;
        }
        post.setAoEnabled(false);
        return true;
      },
    },
    {
      name: 'pixel ratio 1',
      apply: () => {
        if (pixelRatio <= 1) {
          return false;
        }
        pixelRatio = 1;
        resize();
        return true;
      },
    },
    {
      name: 'bloom off',
      apply: () => {
        if (!post || !post.bloomEnabled) {
          return false;
        }
        post.setBloomEnabled(false);
        return true;
      },
    },
    {
      name: 'shadows off',
      apply: () => {
        if (quality === 'low') {
          return false;
        }
        room.setQuality('low');
        return true;
      },
    },
    {
      name: 'pixel ratio 0.75',
      apply: () => {
        if (pixelRatio <= 0.75) {
          return false;
        }
        pixelRatio = 0.75;
        resize();
        return true;
      },
    },
    {
      name: 'garden blur off',
      apply: () => {
        if (!gardenBlur || !gardenBlur.enabled) {
          return false;
        }
        gardenBlur.setEnabled(false);
        return true;
      },
    },
  ]);
  if (/[?&]nogov\b/.test(location.search)) {
    governor.enabled = false;
  }

  const frame = () => {
    if (disposed) {
      return;
    }
    const now = performance.now();
    const dt = clamp((now - last) / 1000, 0.0001, 0.1);
    last = now;
    time += dt;

    CATEGORIES.forEach((c) => updateHero(heroes[c], dt));
    updateDecorFades(dt);
    updateFocus(dt);
    galleryBlend += (galleryBlendTarget - galleryBlend) * (reduced ? 1 : 1 - Math.exp(-4 * dt));
    if (Math.abs(galleryBlendTarget - galleryBlend) < 0.002) {
      galleryBlend = galleryBlendTarget;
    }

    room.update(time, dt);

    if (gallery && ready) {
      rig.setDestination(galleryPose(gallery.st));
    }
    rig.update(dt);
    applyCamera(dt);
    updateHover(dt);

    if (post) {
      if (gardenBlur) {
        gardenBlur.render();
      }
      post.render(dt, time);
    } else {
      renderer.render(scene, camera);
    }
    projectHotspots();

    if (!firstFrame) {
      firstFrame = true;
      reportProgress();
    }
    if (!ready) {
      const elapsed = (now - startedAt) / 1000;
      const settled = tasksDone >= tasksTotal && elapsed >= READY_MIN;
      if (settled || elapsed >= READY_CAP) {
        ready = true;
        reportProgress();
        options.onReady();
        startIntro();
      }
    } else if (performance.now() - startedAt > READY_MIN * 1000 + 3500) {
      governor.sample(now - prevFrameAt);
    }
    prevFrameAt = now;
  };

  const onVisibility = () => {
    if (disposed) {
      return;
    }
    if (document.hidden) {
      renderer.setAnimationLoop(null);
    } else {
      last = performance.now();
      prevFrameAt = last;
      renderer.setAnimationLoop(frame);
    }
  };

  /* ------------------------------------------------------------------ */
  /* Boot                                                                */
  /* ------------------------------------------------------------------ */
  resize();
  if (quality === 'high') {
    try {
      post = new PostFx({ renderer, scene, camera, pixelRatio, width: viewW, height: viewH });
    } catch (err) {
      console.warn('[studio] post-processing unavailable, rendering directly', err);
      post = null;
    }
  }
  const gardenGroup = room.root.getObjectByName('gardenExterior');
  if (post && gardenGroup && !/[?&]noblur\b/.test(location.search)) {
    try {
      gardenBlur = new GardenBlur({ renderer, scene, camera, garden: gardenGroup, width: viewW, height: viewH, pixelRatio });
    } catch (err) {
      console.warn('[studio] garden depth of field unavailable, rendering the garden directly', err);
      gardenBlur = null;
    }
  }
  rig.snapTo(introFrom(toPose('overview')));
  applyCamera(0.016);
  if (post) {
    post.precompile(renderer, scene, camera);
    if (gardenBlur) {
      gardenBlur.precompile();
    }
  } else {
    renderer.compile(scene, camera);
  }

  let resizeObserver: ResizeObserver | null = null;
  const onWindowResize = () => resize();
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(canvas.parentElement || canvas);
  }
  window.addEventListener('resize', onWindowResize);
  document.addEventListener('visibilitychange', onVisibility);

  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    (window as any).__studio = {
      renderer,
      scene,
      camera,
      room,
      post,
      gardenBlur,
      governor,
      THREE,
      /** Freeze the camera rig / parallax at an exact pose (inspection helper). */
      look: (position: [number, number, number], target: [number, number, number], fov?: number) => {
        lookOverride = {
          pos: new THREE.Vector3().fromArray(position),
          target: new THREE.Vector3().fromArray(target),
          fov: fov || 50,
        };
      },
      /** Give the camera back to the rig. */
      release: () => {
        lookOverride = null;
      },
      /** Inspection helper: what the hover raycast finds under a client point (nearest first). */
      pickAt: (clientX: number, clientY: number) => {
        const r = canvas.getBoundingClientRect();
        ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
        raycaster.setFromCamera(ndc, camera);
        const hits = raycaster.intersectObjects(pickObjects, true).slice(0, 6);
        const owner = pickAt(clientX, clientY);
        return {
          owner: owner ? owner.id : null,
          hover: hoverId,
          highlight: highlight.map((v) => Math.round(v * 100) / 100),
          hits: hits.map((h) => `${h.object.name || h.object.type}@${h.distance.toFixed(2)}`),
        };
      },
    };
  }

  renderer.setAnimationLoop(frame);
  reportProgress();

  /* ------------------------------------------------------------------ */
  /* Public API                                                          */
  /* ------------------------------------------------------------------ */
  const leaveGallery = () => {
    if (!gallery) {
      return;
    }
    const st = gallery.st;
    gallery = null;
    st.token++;
    flushWaiters(st);
    focus.target = 0;
    galleryBlendTarget = 0;
    showLanding(st);
  };

  const showPhotoInGallery = (url: string): Promise<void> => {
    const g = gallery;
    if (!g) {
      console.warn('[studio] showPhoto called outside of the slideshow');
      return Promise.resolve();
    }
    const st = g.st;
    const token = ++st.token;
    return new Promise<void>((resolve) => {
      store.load(url).then((photo) => {
        if (disposed || token !== st.token || gallery !== g) {
          resolve();
          return;
        }
        if (!photo) {
          console.warn('[studio] slideshow photo unavailable, keeping the previous one', url);
          resolve();
          return;
        }
        displayHero(st, photo, galleryAspect(photo), resolve);
      });
    });
  };

  const api: StudioSceneApi = {
    setLandingPhotos(urls) {
      CATEGORIES.forEach((c) => {
        const url = urls[c];
        if (!url) {
          return;
        }
        const st = heroes[c];
        track(
          store.load(url, true).then((photo) => {
            if (disposed || !photo) {
              return;
            }
            if (st.landing && st.landing !== photo) {
              store.unpin(st.landing.url);
            }
            st.landing = photo;
            if (!gallery || gallery.st !== st) {
              showLanding(st);
            }
          })
        );
      });
    },

    setDecorPhotos(urls) {
      const frames = room.decorFrames;
      if (!urls.length || !frames.length) {
        return;
      }
      const token = ++decorToken;
      const used = new Set<string>();
      frames.forEach((frame, i) => {
        const url = urls[i % urls.length];
        used.add(url);
        track(
          store.load(url, true).then((photo) => {
            if (disposed || token !== decorToken || !photo) {
              return;
            }
            applyDecor(frame, photo);
          })
        );
      });
      decorUrls.forEach((u) => {
        if (!used.has(u)) {
          store.unpin(u);
        }
      });
      decorUrls = used;
    },

    setHoverHint(id) {
      hoverHint = id;
    },

    goTo(id, opts) {
      if (gallery) {
        leaveGallery();
      }
      currentStation = id;
      if (opts && opts.instant && ready) {
        rig.snapTo(toPose(id));
        return;
      }
      flyToDesired();
    },

    openGallery(category, firstUrl) {
      const st = heroes[category];
      if (gallery && gallery.st !== st) {
        leaveGallery();
      }
      currentStation = category;
      if (!gallery) {
        gallery = { st, category };
        focus.category = category;
        focus.target = 1;
        galleryBlendTarget = 1;
        flyToDesired();
      }
      return showPhotoInGallery(firstUrl);
    },

    showPhoto(url) {
      return showPhotoInGallery(url);
    },

    closeGallery() {
      if (!gallery) {
        return;
      }
      currentStation = gallery.category;
      leaveGallery();
      flyToDesired();
    },

    setViewInset(next) {
      insetTarget.left = Math.max(0, next.left || 0);
      insetTarget.right = Math.max(0, next.right || 0);
      insetTarget.top = Math.max(0, next.top || 0);
      insetTarget.bottom = Math.max(0, next.bottom || 0);
    },

    preload(url) {
      store.load(url).then((photo) => {
        if (photo) {
          idle(() => {
            if (!disposed) {
              renderer.initTexture(photo.texture);
            }
          });
        }
      });
    },

    resize,

    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      renderer.setAnimationLoop(null);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('resize', onWindowResize);
      document.documentElement.removeEventListener('pointerleave', onPointerLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      if (reducedQuery && reducedQuery.removeEventListener) {
        reducedQuery.removeEventListener('change', onReducedChange);
      }
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      canvas.style.cursor = '';
      CATEGORIES.forEach((c) => flushWaiters(heroes[c]));
      if (gardenBlur) {
        gardenBlur.dispose();
      }
      room.dispose();
      decorMats.forEach((m) => m.dispose());
      decorMats.clear();
      decorGeos.forEach((g) => g.geometry.dispose());
      decorGeos.clear();
      store.dispose();
      if (post) {
        post.dispose();
      }
      envTarget.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      const w = window as any;
      if (w.__studio && w.__studio.renderer === renderer) {
        delete w.__studio;
      }
    },
  };

  return api;
};
