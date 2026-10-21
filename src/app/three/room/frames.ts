import * as THREE from 'three';
import type { DecorFrame, HeroFrame, PhotoCategory, Vec3 } from '../studio.types';
import { Kit, put } from './kit';
import { ArtKind, makeArtTexture } from './frames-art';
import { ProfilePt, RingGeo, mergeAttr } from './frames-ring';
import { makeGlassStreak, makeMouldBump, makePlaqueTexture, makeTopLight, makeWallFalloff } from './frames-tex';

/**
 * Black-framed "photo universes": three clusters (hero frame + surrounding decor frames), one on the right wall
 * (x = +2.75, facing -X) and two on the left wall (x = -2.75, facing +X).
 * Frames are authored in a local wall frame: origin on the wall surface, +Z out of the wall, local x = the viewer's
 * right when facing the wall (= -world z on the left wall, +world z on the right wall).
 * Each frame = mitred satin-black moulding + bevelled passe-partout + glass glare + baked wall drop shadow.
 */

export const WALL_L = -2.75;
export const WALL_R = 2.75;

const FACE = 0.0225; // moulding face width
const Z_PHOTO = 0.0145;
const Z_PHOTO_STEP = 0.0027;
const Z_MAT_BASE = Z_PHOTO;
const Z_MAT_TOP = 0.0185;
const Z_GLASS = 0.0235;
const MAT_DECOR = 0.014;
const MAT_HERO = 0.03;
const MAT_ABOUT = 0.014;
const SH_DX = 0.004;
const SH_DY = -0.011;

/** Moulding section: inner rebate wall, bevelled lip, slightly crowned face, outer chamfer, outer wall. */
const MOULD: ProfilePt[] = [
  { o: 0, z: 0.0105, c: 0.3 },
  { o: 0, z: 0.03, c: 0.6 },
  { o: 0.0035, z: 0.0332, c: 0.95 },
  { o: 0.011, z: 0.0338, c: 1 },
  { o: 0.0185, z: 0.0332, c: 0.95 },
  { o: FACE, z: 0.0302, c: 0.8 },
  { o: FACE, z: 0, c: 0.55 },
];

/** Passe-partout: white 45 degree cut core, cream face, shadow line where the moulding lip overhangs. */
const matProfile = (w: number): ProfilePt[] => [
  { o: 0, z: Z_MAT_BASE, c: 1.15 },
  { o: 0.004, z: Z_MAT_TOP, c: 1.12 },
  { o: w - 0.007, z: Z_MAT_TOP, c: 0.96 },
  { o: w, z: Z_MAT_TOP - 0.0004, c: 0.5 },
  { o: w, z: Z_MAT_BASE, c: 0.4 },
];

/** Thin warm-metal liner sitting on the mat edge (hero frames). */
const FILLET: ProfilePt[] = [
  { o: -0.0048, z: Z_MAT_TOP, c: 0.8 },
  { o: -0.0048, z: 0.02, c: 1 },
  { o: -0.0036, z: 0.0211, c: 1.2 },
  { o: -0.0012, z: 0.0215, c: 1.3 },
  { o: 0, z: 0.0207, c: 0.9 },
  { o: 0, z: Z_MAT_TOP, c: 0.6 },
];

const sp = (o: number, a: number): ProfilePt => ({ o, z: 0.0015, c: 0, a });
/** Wall drop shadow: tight dark contact line + long soft penumbra. */
const SHADOW: ProfilePt[] = [sp(-0.012, 0.62), sp(0.003, 0.5), sp(0.012, 0.26), sp(0.03, 0.11), sp(0.06, 0.035), sp(0.09, 0)];

const hp = (o: number, c: number): ProfilePt => ({ o, z: 0.0022, c });
/** Hover glow bleeding out from behind the frame. */
const HALO: ProfilePt[] = [hp(-0.02, 0.9), hp(0, 0.8), hp(0.03, 0.46), hp(0.07, 0.22), hp(0.12, 0.08), hp(0.19, 0)];

type Side = 'L' | 'R';

/** Decor frame, placed relative to its cluster: dx = offset along the wall (viewer's right), y = height of its centre. */
interface DecorDef {
  dx: number;
  y: number;
  w: number;
  h: number;
  kind: ArtKind;
  lit?: boolean;
}

interface ClusterDef {
  cat: PhotoCategory;
  side: Side;
  /** World z of the hero frame. */
  zc: number;
  aspect: number;
  label: string;
  kind: ArtKind;
  decor: DecorDef[];
}

const d = (dx: number, y: number, w: number, h: number, kind: ArtKind, lit = false): DecorDef => ({ dx, y, w, h, kind, lit });

/**
 * Right wall: portraits, above the sofa and cabinet, between the contact phone corner and the bay window.
 * Left wall: graphistes (entrance half) and macros (middle); the workstation takes the far corner.
 * The heroes keep a clear box of 1.3 x 1.16 m (their largest size); decor frames stay outside it.
 */
const CLUSTERS: ClusterDef[] = [
  {
    cat: 'portraits',
    side: 'R',
    zc: -3.0,
    aspect: 0.8,
    label: 'PORTRAITS',
    kind: 'bust',
    decor: [
      d(-1.12, 2.1, 0.3, 0.42, 'bust'),
      d(-1.12, 1.54, 0.3, 0.3, 'smoke'),
      d(-0.5, 2.52, 0.42, 0.18, 'still'),
      d(1.1, 2.12, 0.46, 0.34, 'figure'),
      d(1.0, 1.66, 0.3, 0.3, 'bust'),
    ],
  },
  {
    cat: 'macros',
    side: 'L',
    zc: -2.1,
    aspect: 1.0,
    label: 'MACROS',
    kind: 'eye',
    decor: [
      d(-1.0, 2.02, 0.3, 0.44, 'eye'),
      d(-1.0, 1.5, 0.3, 0.28, 'still'),
      d(-0.3, 2.52, 0.5, 0.18, 'smoke'),
      d(0.9, 2.14, 0.28, 0.4, 'eye'),
    ],
  },
  {
    cat: 'graphistes',
    side: 'L',
    zc: 0.5,
    aspect: 1.5,
    label: 'GRAPHISTES',
    kind: 'graphic',
    decor: [
      d(-1.02, 2.04, 0.34, 0.46, 'figure', true),
      d(-1.02, 1.48, 0.34, 0.26, 'graphic'),
      d(1.0, 2.2, 0.3, 0.34, 'still'),
      d(1.0, 1.62, 0.26, 0.3, 'graphic'),
    ],
  },
];

const HERO_Y = 1.72;
const HERO_MAX_W = 1.2;
const HERO_MAX_H = 1.05;
/** Invisible hover volume around a hero frame: margin (m) and depth in front of the wall (m). */
const HIT_PAD = 0.05;
const HIT_DEPTH = 0.14;

/** Small framed print of Patrick above the workstation (left wall, world z). */
const ABOUT_Z = -3.55;
const ABOUT_Y = 2.28;

interface FrameParts {
  mould: THREE.Material;
  mat: THREE.Material;
  shadow: THREE.Material;
  glass: THREE.Material;
  photoMats: THREE.Material[];
  matW: number;
  fillet?: THREE.Material;
  halo?: THREE.Material;
}

function ringMesh(r: RingGeo, m: THREE.Material, o: { cast?: boolean; receive?: boolean; order?: number } = {}): THREE.Mesh {
  const mesh = new THREE.Mesh(r.geometry, m);
  mesh.frustumCulled = false; // vertices move in place
  mesh.castShadow = !!o.cast;
  mesh.receiveShadow = !!o.receive;
  mesh.renderOrder = o.order || 0;
  return mesh;
}

/** Resizable frame whose rings are rewritten in place: no allocation when the photo aspect morphs. */
class DynFrame {
  readonly group = new THREE.Group();
  readonly photos: THREE.Mesh[] = [];
  /** Solid parts of the frame (moulding, mat, liner, photo planes): what the hover raycast can really hit. */
  readonly solids: THREE.Mesh[] = [];
  readonly glass: THREE.Mesh;
  readonly halo: THREE.Mesh | null = null;
  outerH = 1;
  private readonly rMould = new RingGeo(MOULD);
  private readonly rMat: RingGeo;
  private readonly rFillet: RingGeo | null = null;
  private readonly rShadow = new RingGeo(SHADOW, { alpha: true, uvU: 0, uvV: 0 });
  private readonly rHalo: RingGeo | null = null;
  private readonly matW: number;

  constructor(k: Kit, p: FrameParts) {
    this.matW = p.matW;
    this.rMat = new RingGeo(matProfile(p.matW), { uvU: 0, uvV: 0 });
    this.group.add(ringMesh(this.rShadow, p.shadow));
    if (p.halo) {
      this.rHalo = new RingGeo(HALO, { uvU: 0, uvV: 0 });
      this.halo = ringMesh(this.rHalo, p.halo, { order: 1 });
      this.halo.visible = false;
      this.group.add(this.halo);
    }
    const mould = ringMesh(this.rMould, p.mould, { cast: true, receive: true });
    const mat = ringMesh(this.rMat, p.mat, { receive: true });
    this.group.add(mould, mat);
    this.solids.push(mould, mat);
    if (p.fillet) {
      this.rFillet = new RingGeo(FILLET, { uvU: 0, uvV: 0 });
      const fillet = ringMesh(this.rFillet, p.fillet);
      this.group.add(fillet);
      this.solids.push(fillet);
    }
    p.photoMats.forEach((pm, i) => {
      const ph = new THREE.Mesh(k.plane(1, 1), pm);
      ph.position.z = Z_PHOTO + i * Z_PHOTO_STEP;
      ph.renderOrder = 2 + i;
      this.group.add(ph);
      this.photos.push(ph);
      this.solids.push(ph);
    });
    this.glass = new THREE.Mesh(k.plane(1, 1), p.glass);
    this.glass.position.z = Z_GLASS;
    this.glass.renderOrder = 10;
    this.group.add(this.glass);
  }

  setSize(pw: number, ph: number) {
    const iw = pw + 2 * this.matW;
    const ih = ph + 2 * this.matW;
    this.rMould.update(iw, ih);
    this.rMat.update(pw, ph);
    if (this.rFillet) {
      this.rFillet.update(iw, ih);
    }
    this.rShadow.update(iw + 2 * FACE, ih + 2 * FACE, SH_DX, SH_DY);
    if (this.rHalo) {
      this.rHalo.update(iw + 2 * FACE, ih + 2 * FACE);
    }
    this.glass.scale.set(iw, ih, 1);
    for (const p of this.photos) {
      p.scale.set(pw, ph, 1);
    }
    this.outerH = ih + 2 * FACE;
  }
}

export interface Gallery {
  group: THREE.Group;
  decor: DecorFrame[];
  heroes: Record<PhotoCategory, HeroFrame>;
  /** Glow planes + helper data used to drive highlights from the room. */
  placeholder: THREE.Texture;
  /** Small portrait of Patrick (loaded lazily). */
  about: THREE.Group;
  /** Slideshow: 0 = room, 1 = the hero glass layer and hover glow are fully off (photo shown as the bare texture). */
  setFocus(amount: number): void;
  /** Optional: drop clearcoat / grain bump on the mouldings in low quality. */
  setQuality?(quality: 'high' | 'low'): void;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function buildGallery(k: Kit, glowTex: THREE.Texture): Gallery {
  const group = new THREE.Group();
  group.name = 'gallery';
  const walls: Record<Side, THREE.Group> = { L: new THREE.Group(), R: new THREE.Group() };
  walls.L.name = 'galleryLeft';
  walls.L.position.set(WALL_L, 0, 0);
  walls.L.rotation.y = Math.PI / 2;
  walls.R.name = 'galleryRight';
  walls.R.position.set(WALL_R, 0, 0);
  walls.R.rotation.y = -Math.PI / 2;
  group.add(walls.L, walls.R);
  /** Local x of a world z on the given wall. */
  const localX = (side: Side, z: number) => (side === 'L' ? -z : z);

  /* ----- shared textures + materials ----- */
  const grain = k.tex(makeMouldBump());
  const streak = k.tex(makeGlassStreak());
  const falloff = k.tex(makeWallFalloff());
  const topLight = k.tex(makeTopLight());

  const mouldMats: THREE.MeshPhysicalMaterial[] = [];
  const makeMould = () => {
    const m = new THREE.MeshPhysicalMaterial({
      color: 0x08080a,
      roughness: 0.46,
      metalness: 0.04,
      clearcoat: 0.22,
      clearcoatRoughness: 0.4,
      envMapIntensity: 0.2,
      vertexColors: true,
      bumpMap: grain,
      bumpScale: 0.22,
    });
    mouldMats.push(m);
    return m;
  };
  const mouldBase = makeMould();
  const matMat = new THREE.MeshStandardMaterial({ color: 0xece5d3, roughness: 0.93, metalness: 0, vertexColors: true });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a05a, roughness: 0.3, metalness: 0.95, vertexColors: true });
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  /** Glass = additive specular + faint glare bands, so the photo is never washed out. */
  const glassBase = new THREE.MeshPhysicalMaterial({
    color: 0x000000,
    roughness: 0.24,
    specularIntensity: 0.4,
    metalness: 0,
    emissive: 0xffffff,
    emissiveMap: streak,
    emissiveIntensity: 1,
    envMapIntensity: 0.5,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  // soft darkening toward the ceiling and the ends of the gallery walls
  const falloffMat = new THREE.MeshBasicMaterial({
    map: falloff,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const addFalloff = (side: Side, z0: number, z1: number) => {
    const m = new THREE.Mesh(k.plane(z1 - z0, 2.2), falloffMat);
    m.position.set(localX(side, (z0 + z1) / 2), 1.6, 0.0008);
    m.name = 'wallFalloff';
    walls[side].add(m);
  };
  addFalloff('L', -4.4, 2.2);
  addFalloff('R', -4.4, -1.0);

  /* ----- decor frames: merged geometry per wall, 5 draw calls + one photo plane each ----- */
  const decor: DecorFrame[] = [];
  const placeholders: THREE.Texture[] = [];
  const merged: Record<Side, { mould: THREE.BufferGeometry[]; mat: THREE.BufferGeometry[]; shadow: THREE.BufferGeometry[]; glass: THREE.BufferGeometry[] }> = {
    L: { mould: [], mat: [], shadow: [], glass: [] },
    R: { mould: [], mat: [], shadow: [], glass: [] },
  };
  let decorIndex = 0;
  const litFrames: Array<{ side: Side; lx: number; def: DecorDef }> = [];
  for (const cl of CLUSTERS) {
    const lxc = localX(cl.side, cl.zc);
    for (const df of cl.decor) {
      const lx = lxc + df.dx;
      const iw = df.w + 2 * MAT_DECOR;
      const ih = df.h + 2 * MAT_DECOR;
      const m = merged[cl.side];
      m.mould.push(new RingGeo(MOULD).update(iw, ih, lx, df.y).geometry);
      m.mat.push(new RingGeo(matProfile(MAT_DECOR)).update(df.w, df.h, lx, df.y).geometry);
      m.shadow.push(new RingGeo(SHADOW, { alpha: true }).update(iw + 2 * FACE, ih + 2 * FACE, lx + SH_DX, df.y + SH_DY).geometry);
      m.glass.push(new THREE.PlaneGeometry(iw, ih).translate(lx, df.y, Z_GLASS));
      const art = k.tex(makeArtTexture(df.w / df.h, 1201 + decorIndex * 57, df.kind, 192));
      placeholders.push(art);
      const pm = new THREE.MeshBasicMaterial({ map: art, toneMapped: false });
      const photo = new THREE.Mesh(k.plane(1, 1), pm);
      photo.position.set(lx, df.y, Z_PHOTO);
      photo.scale.set(df.w, df.h, 1);
      photo.name = 'decorPhoto';
      walls[cl.side].add(photo);
      decor.push({ aspect: df.w / df.h, photoMesh: photo });
      if (df.lit) {
        litFrames.push({ side: cl.side, lx, def: df });
      }
      decorIndex++;
    }
  }
  const addStatic = (side: Side, geos: THREE.BufferGeometry[], mat: THREE.Material, o: { cast?: boolean; receive?: boolean; order?: number; name: string }) => {
    const m = new THREE.Mesh(mergeAttr(geos), mat);
    m.castShadow = !!o.cast;
    m.receiveShadow = !!o.receive;
    m.renderOrder = o.order || 0;
    m.name = o.name;
    walls[side].add(m);
    return m;
  };
  for (const side of ['L', 'R'] as Side[]) {
    const m = merged[side];
    addStatic(side, m.shadow, shadowMat, { name: 'decorShadows' });
    addStatic(side, m.mould, mouldBase, { name: 'decorFrames', cast: true, receive: true });
    addStatic(side, m.mat, matMat, { name: 'decorMats', receive: true });
    addStatic(side, m.glass, glassBase, { name: 'decorGlass', order: 10 });
  }

  /* ----- hero frames ----- */
  const heroes = {} as Record<PhotoCategory, HeroFrame>;
  const plateBrass = k.std(0x9c7a42, 0.38, 0.85);
  const heroGlass: Array<{ mesh: THREE.Mesh; mat: THREE.MeshPhysicalMaterial }> = [];
  let focusAmt = 0;
  for (const def of CLUSTERS) {
    const wallX = def.side === 'L' ? WALL_L : WALL_R;
    const inward = def.side === 'L' ? 1 : -1;
    const lx = localX(def.side, def.zc);
    const mould = makeMould();
    const glass = glassBase.clone();
    const art = k.tex(makeArtTexture(def.aspect, 77 + def.zc * 100, def.kind, 320));
    placeholders.push(art);
    // fog off: the slideshow must show the bare texture
    const photoBack = new THREE.MeshBasicMaterial({ map: art, transparent: true, toneMapped: false, opacity: 1, fog: false });
    const photoFront = new THREE.MeshBasicMaterial({ map: art, transparent: true, toneMapped: false, opacity: 0, fog: false });
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xffb468,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const frame = new DynFrame(k, {
      mould,
      mat: matMat,
      shadow: shadowMat,
      glass,
      photoMats: [photoBack, photoFront],
      matW: MAT_HERO,
      fillet: brass,
      halo: haloMat,
    });
    frame.group.position.set(lx, HERO_Y, 0);
    frame.group.name = `hero-${def.cat}`;
    walls[def.side].add(frame.group);
    heroGlass.push({ mesh: frame.glass, mat: glass });

    // engraved brass name plate under the frame
    const plaqueTex = k.tex(makePlaqueTexture(def.label));
    const plaque = new THREE.Group();
    put(plaque, k.rbox(0.27, 0.058, 0.008, 0.0035), plateBrass, 0, 0, 0.004, { cast: true });
    const label = new THREE.Mesh(
      k.plane(0.256, 0.048),
      new THREE.MeshStandardMaterial({ map: plaqueTex, bumpMap: plaqueTex, bumpScale: 1.4, roughness: 0.42, metalness: 0.55 })
    );
    label.position.z = 0.0084;
    plaque.add(label);
    frame.group.add(plaque);

    // slightly generous invisible hit volume in front of the frame and its plaque; it follows the photo size
    const hit = new THREE.Mesh(k.box(1, 1, 1), new THREE.MeshBasicMaterial({ visible: false }));
    hit.visible = false;
    hit.name = `hit-${def.cat}`;
    frame.group.add(hit);
    const plaqueSolids: THREE.Mesh[] = [];
    plaque.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        plaqueSolids.push(o as THREE.Mesh);
      }
    });

    const size = { width: 1, height: 1 };
    const apply = (aspect: number) => {
      const a = Math.max(0.2, Math.min(5, aspect || 1));
      let pw: number;
      let ph: number;
      if (a >= HERO_MAX_W / HERO_MAX_H) {
        pw = HERO_MAX_W;
        ph = HERO_MAX_W / a;
      } else {
        ph = HERO_MAX_H;
        pw = HERO_MAX_H * a;
      }
      size.width = pw;
      size.height = ph;
      frame.setSize(pw, ph);
      plaque.position.set(0, -(frame.outerH / 2 + 0.066), 0);
      // outer frame + a 5 cm margin, down to the bottom of the name plate
      const top = frame.outerH / 2 + HIT_PAD;
      const bottom = -(frame.outerH / 2 + 0.066 + 0.029 + HIT_PAD);
      hit.scale.set(pw + 2 * (MAT_HERO + FACE + HIT_PAD), top - bottom, HIT_DEPTH);
      hit.position.set(0, (top + bottom) / 2, HIT_DEPTH / 2);
    };
    apply(def.aspect);

    const hero: HeroFrame = {
      id: def.cat,
      category: def.cat,
      anchor: [wallX + inward * 0.12, HERO_Y - HERO_MAX_H / 2 - 0.16, def.zc] as Vec3,
      // real surfaces first (what is drawn is always hoverable), the volume only adds a few cm of margin around them
      pick: [...frame.solids, ...plaqueSolids, hit],
      center: [wallX + inward * 0.017, HERO_Y, def.zc] as Vec3,
      normal: [inward, 0, 0] as Vec3,
      maxWidth: HERO_MAX_W,
      maxHeight: HERO_MAX_H,
      photoMeshes: [frame.photos[0], frame.photos[1]],
      setPhotoAspect: apply,
      getPhotoSize: () => ({ width: size.width, height: size.height }),
      setHighlight: (v: number) => {
        // hover glow is part of the room: it fades out with the slideshow
        const a = Math.max(0, Math.min(1, v)) * (1 - focusAmt);
        haloMat.opacity = a * 0.7;
        if (frame.halo) {
          frame.halo.visible = a > 0.01;
        }
        mould.emissive.setRGB(0.09 * a, 0.05 * a, 0.02 * a);
        glass.emissiveIntensity = 1 + 0.8 * a;
        // gentle lift off the wall
        frame.group.scale.setScalar(1 + 0.016 * a);
        frame.group.position.z = 0.01 * a;
      },
    };
    heroes[def.cat] = hero;
  }

  /* ----- picture light above one decor frame (no real light: emissive bar + glow sprites) ----- */
  if (litFrames.length) {
    const L = litFrames[0];
    const df = L.def;
    const yTop = df.y + df.h / 2 + MAT_DECOR + FACE; // top edge of the moulding
    const yBar = yTop + 0.056;
    const lamp = new THREE.Group();
    lamp.name = 'pictureLight';
    lamp.position.x = L.lx;
    const metal = k.std(0x0f0f10, 0.34, 0.75);
    const brassArm = k.std(0xb08a4a, 0.3, 0.9);
    put(lamp, k.cyl(0.03, 0.03, 0.012, 24), metal, 0, yBar + 0.08, 0.006, { rx: Math.PI / 2, cast: true });
    put(lamp, k.cyl(0.017, 0.017, 0.006, 20), brassArm, 0, yBar + 0.08, 0.015, { rx: Math.PI / 2 });
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, yBar + 0.08, 0.012),
      new THREE.Vector3(0, yBar + 0.08, 0.07),
      new THREE.Vector3(0, yBar + 0.066, 0.118),
      new THREE.Vector3(0, yBar + 0.028, 0.138),
      new THREE.Vector3(0, yBar + 0.006, 0.14),
    ]);
    put(lamp, new THREE.TubeGeometry(curve, 24, 0.0055, 8, false), brassArm, 0, 0, 0, { cast: true });
    put(lamp, k.rbox(0.3, 0.026, 0.04, 0.012), metal, 0, yBar, 0.14, { cast: true });
    put(lamp, k.box(0.28, 0.0025, 0.026), k.glow(0xffe2b4, 1.8), 0, yBar - 0.0135, 0.14);
    const spriteMat = k.glow(0xffc884, 0.55, {
      map: glowTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const sprite = new THREE.Mesh(k.plane(0.56, 0.18), spriteMat);
    sprite.position.set(0, yBar - 0.012, 0.17);
    sprite.renderOrder = 5;
    lamp.add(sprite);
    const poolMat = k.glow(0xffc884, 0.42, {
      map: glowTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const pool = new THREE.Mesh(k.plane(0.9, 0.55), poolMat);
    pool.position.set(0, yTop - 0.04, 0.0035);
    pool.renderOrder = 1;
    lamp.add(pool);
    const washMat = k.glow(0xffd9a8, 0.3, {
      map: topLight,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const wash = new THREE.Mesh(k.plane(df.w + 2 * MAT_DECOR, 0.34), washMat);
    wash.position.set(0, df.y + df.h / 2 + MAT_DECOR - 0.17, Z_GLASS + 0.001);
    wash.renderOrder = 11;
    lamp.add(wash);
    walls[L.side].add(lamp);
  }

  /* ----- small portrait of Patrick above the workstation ----- */
  const about = new THREE.Group();
  about.name = 'aboutPortrait';
  const aboutArt = k.tex(makeArtTexture(0.75, 4242, 'bust', 192));
  placeholders.push(aboutArt);
  const aboutMat = new THREE.MeshBasicMaterial({ map: aboutArt, toneMapped: false });
  const aboutFrame = new DynFrame(k, {
    mould: mouldBase,
    mat: matMat,
    shadow: shadowMat,
    glass: glassBase,
    photoMats: [aboutMat],
    matW: MAT_ABOUT,
  });
  aboutFrame.setSize(0.3, 0.4);
  aboutFrame.group.position.set(localX('L', ABOUT_Z), ABOUT_Y, 0);
  about.add(aboutFrame.group);
  walls.L.add(about);
  try {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(
      'assets/images/about-picture-crop.jpg',
      (t) => {
        t.encoding = THREE.sRGBEncoding;
        t.anisotropy = k.aniso;
        k.tex(t);
        aboutMat.map = t;
        aboutMat.needsUpdate = true;
        const img = t.image as { width: number; height: number } | undefined;
        if (img && img.width && img.height) {
          const a = img.width / img.height;
          const maxW = 0.34;
          const maxH = 0.44;
          aboutFrame.setSize(a >= maxW / maxH ? maxW : maxH * a, a >= maxW / maxH ? maxW / a : maxH);
        }
      },
      undefined,
      () => undefined
    );
  } catch (e) {
    // purely decorative
  }

  const setFocus = (amount: number) => {
    focusAmt = clamp01(amount);
    for (const g of heroGlass) {
      g.mat.opacity = 1 - focusAmt;
      g.mesh.visible = focusAmt < 0.995;
    }
  };

  const setQuality = (q: 'high' | 'low') => {
    const hi = q === 'high';
    for (const m of mouldMats) {
      m.clearcoat = hi ? 0.22 : 0;
      m.bumpMap = hi ? grain : null;
      m.needsUpdate = true;
    }
  };

  return { group, decor, heroes, placeholder: placeholders[0], about, setFocus, setQuality };
}
