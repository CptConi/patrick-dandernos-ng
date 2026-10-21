import * as THREE from 'three';
import { rng } from '../procedural-textures';
import { Bake, Inst, blobGeo, coneGeo, fillInstances, gardenMaterial, lin, makeUniforms } from './garden-kit';
import {
  GroundPlan,
  TERRAIN,
  groundY,
  makeCloudTexture,
  makeFoliageCardTexture,
  makeGroundTexture,
  makeSkyTexture,
} from './garden-paint';

/**
 * A small stylised garden behind the bay window: real 3D layers (stone terrace with pots, flower beds,
 * clipped hedges, box balls, a conical topiary, a blossom tree and a lush tree, a low white wall, the neighbour's roof,
 * hazy hills and tree line, sky dome with drifting clouds and a pale sun). Everything is unlit (baked soft shading in
 * vertex colours, painted ground map, haze towards the sky colour with distance), lives behind the wall plane
 * (z < -4.7) and costs ~13 draw calls.
 */

export interface GardenExterior {
  group: THREE.Group;
  update(t: number, dt: number): void;
  setQuality(q: 'high' | 'low'): void;
  /** Overall brightness (1 = daylight). The room dims the window in slideshow mode. */
  setBrightness(v: number): void;
  dispose(): void;
}

export interface GardenOptions {
  quality: 'high' | 'low';
  aniso: number;
  /** Soft round glow sprite (alpha), shared with the room. */
  glow: THREE.Texture;
}

const SKY_R = 62;
const SKY_THETA = Math.PI / 2 + 0.12;

export function buildGardenExterior(opts: GardenOptions): GardenExterior {
  const hiQ = opts.quality === 'high';
  const rand = rng(2024);
  const U = makeUniforms();
  const group = new THREE.Group();
  group.name = 'gardenExterior';
  const owned: Array<{ dispose(): void }> = [];
  const own = <T extends { dispose(): void }>(o: T): T => {
    owned.push(o);
    return o;
  };
  const motion = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  /* ----- palette (sRGB hex -> linear) ----- */
  const L = (list: number[]) => list.map(lin);
  const C = {
    hedge: L([0x3d8b44, 0x479a47, 0x54a64b, 0x3a8143]),
    ball: L([0x62b04c, 0x58a548, 0x6ab955]),
    cone: L([0x2f7050, 0x2a6a4a]),
    lush: L([0x5aa646, 0x69b040, 0x7cc04a, 0x8bcd55]),
    blossom: L([0xfbd5e2, 0xfff0f3, 0xf7bfd2, 0xffe3ec]),
    bud: L([0xb9da8a, 0xa5cf78]),
    flower: L([0xf48fb1, 0xffd45c, 0xb79bf0, 0xffffff, 0xff9a6b, 0xf7c1d6]),
    bark: lin(0x6e5646),
    barkLight: lin(0x85705e),
    terracotta: lin(0xd0734a),
    wood: lin(0xbd915f),
    woodDark: lin(0x8c6a47),
    wall: lin(0xf6f2e8),
    cap: lin(0xe6dfce),
    house: lin(0xf3e8d2),
    roof: lin(0xc9694a),
    shutter: lin(0x7fa593),
    glass: lin(0x56687c),
    slate: lin(0x707986),
    far: L([0x4e8a52, 0x5d9a58, 0x3f7c4e, 0x6aa860]),
    cloud: lin(0xffffff),
    bird: lin(0x46525e),
  };
  const pick = (a: THREE.Color[]) => a[Math.floor(rand() * a.length)];
  const jit = (c: THREE.Color, a: number) => c.clone().multiplyScalar(1 + (rand() - 0.5) * a);

  /* ----- geometry & materials ----- */
  const hedgeG = own(blobGeo(2, { noise: 0.05, exp: 0.62, seed: 1 }));
  const blobHiG = own(blobGeo(2, { noise: 0.2, exp: 1, seed: 2 }));
  const blobLoG = own(blobGeo(1, { noise: 0.22, exp: 1, seed: 3 }));
  const flowerG = own(blobGeo(0, { noise: 0.1, exp: 1, seed: 4 }));
  const coneG = own(coneGeo(3));
  const foliageMat = own(gardenMaterial({ vertexColors: true }, U, { wind: true }));
  const flatMat = own(gardenMaterial({ vertexColors: true }, U));

  const hedges: Inst[] = [];
  const blobsHi: Inst[] = [];
  const blobsLo: Inst[] = [];
  const cones: Inst[] = [];
  const flowers: Inst[] = [];
  const bake = new Bake();
  const plan: GroundPlan = {
    ao: [],
    beds: [
      { x: -3.7, z: -8.6, rx: 2.7, rz: 0.62 },
      { x: 3.6, z: -8.5, rx: 2.7, rz: 0.62 },
    ],
    path: [[1.0, -7.0], [0.9, -9.8], [0.2, -13], [-1.0, -16.2], [-1.7, -18], [-1.9, -22], [-0.8, -28], [0.6, -34], [0.4, -44]],
  };
  const gy = groundY;

  /* ----- placement helpers ----- */
  const hedge = (x: number, z: number, w: number, h: number, d: number) => {
    hedges.push({ x, y: gy(x, z) + h / 2 - 0.06, z, sx: w / 2, sy: h / 2, sz: d / 2, ry: (rand() - 0.5) * 0.04, c: jit(pick(C.hedge), 0.12) });
    plan.ao.push([x, z, w * 0.58, d * 0.9, 0.42]);
  };
  const ballAt = (x: number, y: number, z: number, r: number, ao = true) => {
    hedges.push({ x, y, z, sx: r, sy: r * 0.94, sz: r, ry: rand() * 3, c: jit(pick(C.ball), 0.14) });
    if (ao) {
      plan.ao.push([x, z, r * 1.25, r * 1.15, 0.38]);
    }
  };
  const ball = (x: number, z: number, r: number) => ballAt(x, gy(x, z) + r * 0.86, z, r);
  const cone = (x: number, z: number, h: number, r: number, c?: THREE.Color) => {
    cones.push({ x, y: gy(x, z) + h / 2 - 0.08, z, sx: r, sy: h / 2, sz: r, ry: rand() * 3, c: c || jit(pick(C.cone), 0.14) });
    plan.ao.push([x, z, r * 1.5, r * 1.3, 0.4]);
  };
  const crown = (cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, n: number, s0: number, s1: number, pal: THREE.Color[], hiShare: number) => {
    for (let i = 0; i < n; i++) {
      const v = rand() * 2 - 1;
      const th = rand() * Math.PI * 2;
      const rr = Math.pow(rand(), 0.33) * 0.55 + 0.45;
      const sq = Math.sqrt(1 - v * v);
      const py = cy + ry * rr * v * (v < 0 ? 0.75 : 1);
      const f = (py - (cy - ry)) / (2 * ry);
      const s = s0 + rand() * (s1 - s0);
      const c = pal[0].clone().lerp(pal[pal.length - 1], Math.min(1, f * 0.8 + rand() * 0.3));
      const it: Inst = {
        x: cx + rx * rr * sq * Math.cos(th),
        y: py,
        z: cz + rz * rr * sq * Math.sin(th),
        sx: s * (0.95 + rand() * 0.3),
        sy: s * 0.86,
        sz: s,
        ry: rand() * 3,
        c: jit(c, 0.1),
      };
      (rand() < hiShare ? blobsHi : blobsLo).push(it);
    }
  };
  const trunk = (x: number, z: number, h: number, r: number, lean = 0) => {
    const g = gy(x, z);
    bake.rod(x, g - 0.15, z, x + lean, g + h, z, r, r * 0.62, C.bark, 7);
    plan.ao.push([x, z, r * 6, r * 5, 0.3]);
  };

  /* ----- layer 1: terrace dressing ----- */
  const potG = own(new THREE.CylinderGeometry(0.32, 0.21, 0.46, 16, 1, false));
  const rimG = own(new THREE.CylinderGeometry(0.345, 0.335, 0.07, 16, 1, false));
  const boxG = own(new THREE.BoxGeometry(1, 1, 1));
  const pot = (x: number, z: number, s: number) => {
    const g = gy(x, z);
    bake.add(potG, jit(C.terracotta, 0.1), x, g + 0.23 * s, z, { sx: s, sy: s, sz: s }, 0.3);
    bake.add(rimG, jit(C.terracotta, 0.06), x, g + 0.46 * s, z, { sx: s, sy: s, sz: s }, 0);
    plan.ao.push([x, z, 0.4 * s, 0.34 * s, 0.4]);
    return g + 0.46 * s;
  };
  ballAt(-2.05, pot(-2.05, -5.55, 0.62) + 0.22, -5.55, 0.36, false);
  ballAt(2.05, pot(2.05, -5.55, 0.62) + 0.22, -5.55, 0.36, false);
  ballAt(-3.75, pot(-3.75, -6.05, 0.85) + 0.3, -6.05, 0.48, false);
  {
    const top = pot(3.95, -6.3, 0.95);
    cones.push({ x: 3.95, y: top + 0.55, z: -6.3, sx: 0.36, sy: 0.62, sz: 0.36, c: jit(pick(C.cone), 0.1) });
  }

  /* ----- layer 2: beds, hedges, balls, topiary ----- */
  for (const b of plan.beds) {
    for (let i = 0; i < 64; i++) {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * 0.86;
      const x = b.x + Math.cos(a) * d * b.rx;
      const z = b.z + Math.sin(a) * d * b.rz;
      const s = 0.06 + rand() * 0.07;
      flowers.push({ x, y: gy(x, z) + 0.16 + rand() * 0.3, z, sx: s, sy: s, sz: s, c: pick(C.flower).clone() });
    }
    for (let i = 0; i < 6; i++) {
      const x = b.x + (i / 5 - 0.5) * 1.7 * b.rx;
      const z = b.z + (rand() - 0.5) * b.rz;
      const r = 0.3 + rand() * 0.14;
      hedges.push({ x, y: gy(x, z) + r * 0.55, z, sx: r * 1.2, sy: r * 0.75, sz: r, ry: rand() * 3, c: jit(pick(C.hedge), 0.1) });
    }
  }
  hedge(-6.0, -9.9, 2.7, 1.55, 1.25);
  hedge(-3.45, -10.0, 2.7, 1.72, 1.25);
  hedge(-1.5, -10.1, 2.1, 1.45, 1.2);
  hedge(3.2, -10.1, 2.1, 1.5, 1.2);
  hedge(5.2, -10.0, 2.9, 1.78, 1.25);
  hedge(7.9, -10.2, 2.7, 1.5, 1.2);
  hedge(-9.5, -10.4, 3.4, 1.4, 1.2);
  ball(-4.9, -8.0, 0.5);
  ball(-2.5, -8.0, 0.42);
  ball(2.4, -8.1, 0.5);
  ball(4.9, -8.0, 0.44);
  ball(-0.85, -7.8, 0.36);
  ball(2.3, -7.8, 0.36);
  cone(4.5, -8.9, 2.7, 0.78);
  cone(-1.7, -11.9, 2.2, 0.62);

  /* ----- layer 3: trees, conifers, wall, neighbour ----- */
  const treeTips: number[][] = [];
  const branch = (ax: number, ay: number, az: number, dx: number, dy: number, dz: number, len: number, r: number, depth: number) => {
    const bx = ax + dx * len;
    const by = ay + dy * len;
    const bz = az + dz * len;
    bake.rod(ax, ay, az, bx, by, bz, r, r * 0.62, rand() < 0.3 ? C.barkLight : C.bark, 5);
    if (depth <= 0) {
      treeTips.push([bx, by, bz]);
      return;
    }
    if (depth === 1) {
      treeTips.push([bx, by, bz]);
    }
    for (let k = 0; k < (depth > 1 ? 3 : 2); k++) {
      const nx = dx + (rand() - 0.5) * 1.1;
      const ny = dy * 0.7 + 0.35 + rand() * 0.3;
      const nz = dz + (rand() - 0.5) * 1.1;
      const l = Math.hypot(nx, ny, nz);
      branch(bx, by, bz, nx / l, ny / l, nz / l, len * (0.66 + rand() * 0.12), r * 0.62, depth - 1);
    }
  };
  // spring blossom tree, still half bare
  const blossomTree = (x: number, z: number, s: number, density: number) => {
    const g = gy(x, z);
    treeTips.length = 0;
    const lean = (rand() - 0.5) * 0.3 * s;
    trunk(x, z, 2.5 * s, 0.2 * s, lean);
    const top = g + 2.5 * s;
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + rand() * 0.6;
      const up = 0.75 + rand() * 0.5;
      const l = Math.hypot(Math.cos(a), up, Math.sin(a));
      branch(x + lean, top - 0.1, z, Math.cos(a) / l, up / l, Math.sin(a) / l, (1.7 + rand() * 0.8) * s, 0.11 * s, 2);
    }
    for (const t of treeTips) {
      if (rand() < density) {
        const sz = (0.3 + rand() * 0.28) * s;
        blobsLo.push({ x: t[0], y: t[1], z: t[2], sx: sz, sy: sz * 0.85, sz, ry: rand() * 3, c: jit(rand() < 0.22 ? pick(C.bud) : pick(C.blossom), 0.06) });
      }
    }
  };
  blossomTree(-4.3, -13.2, 1.15, 0.7);
  blossomTree(12.5, -24, 1.0, 0.8);
  const lushTree = (x: number, z: number, s: number, n: number) => {
    const g = gy(x, z);
    trunk(x, z, 2.5 * s, 0.24 * s, 0);
    crown(x, g + 5.0 * s, z, 3.1 * s, 2.3 * s, 2.9 * s, n, 0.8 * s, 1.5 * s, [C.lush[0], C.lush[3]], 0.35);
  };
  lushTree(5.4, -14.8, 1.1, 46);
  lushTree(-11, -20, 1.0, 38);
  lushTree(1.5, -31, 1.3, 38);
  lushTree(-16, -34, 1.5, 30);
  cone(3.1, -13.6, 6.2, 1.5, jit(C.cone[0], 0.1));
  cone(-8, -15.5, 4.8, 1.2);
  cone(9.5, -17, 5.4, 1.3);
  for (const [x, z] of [[-7.2, -12.4], [7.6, -12.2], [-3.9, -16.5]]) {
    const g = gy(x, z);
    for (let i = 0; i < 5; i++) {
      const a = rand() * Math.PI * 2;
      const s = 0.45 + rand() * 0.35;
      blobsHi.push({
        x: x + Math.cos(a) * 0.55,
        y: g + s * 0.8 + rand() * 0.4,
        z: z + Math.sin(a) * 0.55,
        sx: s,
        sy: s * 0.85,
        sz: s,
        ry: rand() * 3,
        c: jit(rand() < 0.45 ? pick(C.blossom) : pick(C.lush), 0.1),
      });
    }
    plan.ao.push([x, z, 1.4, 1.2, 0.35]);
  }

  // low white garden wall with a gate gap for the path
  const WALL_Z = -18;
  const wallSeg = (x0: number, x1: number) => {
    const w = x1 - x0;
    const x = (x0 + x1) / 2;
    const g = gy(x, WALL_Z);
    bake.add(boxG, C.wall, x, g + 0.55, WALL_Z, { sx: w, sy: 1.15, sz: 0.32 }, 0.3);
    bake.add(boxG, C.cap, x, g + 1.17, WALL_Z, { sx: w + 0.04, sy: 0.07, sz: 0.4 }, 0);
    for (let s = x0 + 2.5; s < x1; s += 5) {
      plan.ao.push([s, WALL_Z - 0.1, 2.8, 0.7, 0.28]);
    }
  };
  wallSeg(-15, -2.95);
  wallSeg(-0.45, 15);
  for (const px of [-3.0, -0.4, -9, 6]) {
    const g = gy(px, WALL_Z);
    bake.add(boxG, C.wall, px, g + 0.75, WALL_Z, { sx: 0.5, sy: 1.5, sz: 0.5 }, 0.3);
    bake.add(boxG, C.cap, px, g + 1.52, WALL_Z, { sx: 0.62, sy: 0.08, sz: 0.62 }, 0);
  }

  // neighbour's house (roof peeks over the wall) and garden shed
  {
    const hx = -6.8;
    const hz = -27;
    const g = gy(hx, hz);
    bake.add(boxG, C.house, hx, g + 1.8, hz, { sx: 7.2, sy: 3.6, sz: 5.2 }, 0.35);
    const roofG = own(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1));
    bake.add(roofG, C.roof, hx, g + 3.6 + 1.1, hz, { ry: Math.PI / 4, sx: 8.1, sy: 2.2, sz: 6.0 }, 0.15);
    bake.add(boxG, C.cap, hx + 1.6, g + 5.4, hz + 0.3, { sx: 0.55, sy: 1.4, sz: 0.55 }, 0.2);
    const fz = hz + 2.6 + 0.02;
    for (const wx of [-2.1, 2.1]) {
      bake.add(boxG, C.wall, hx + wx, g + 2.2, fz, { sx: 1.1, sy: 1.4, sz: 0.06 }, 0);
      bake.add(boxG, C.glass, hx + wx, g + 2.2, fz + 0.03, { sx: 0.9, sy: 1.2, sz: 0.04 }, 0);
      for (const sxn of [-0.72, 0.72]) {
        bake.add(boxG, C.shutter, hx + wx + sxn, g + 2.2, fz + 0.04, { sx: 0.4, sy: 1.3, sz: 0.04 }, 0);
      }
    }
    bake.add(boxG, C.woodDark, hx, g + 1.05, fz + 0.02, { sx: 1.0, sy: 2.1, sz: 0.06 }, 0);
    plan.ao.push([hx, hz, 5.2, 3.8, 0.35]);
    const sx = 8.6;
    const sz = -23.2;
    const gs = gy(sx, sz);
    bake.add(boxG, C.wood, sx, gs + 1.05, sz, { sx: 2.9, sy: 2.1, sz: 2.1 }, 0.3);
    bake.add(boxG, C.slate, sx, gs + 2.2, sz, { sx: 3.3, sy: 0.1, sz: 2.6, rz: 0.12 }, 0);
    bake.add(boxG, C.glass, sx - 0.5, gs + 1.2, sz + 1.06, { sx: 0.7, sy: 0.7, sz: 0.04 }, 0);
    plan.ao.push([sx, sz, 2.2, 1.7, 0.35]);
  }

  /* ----- far tree line: soft alpha cards sorted back to front ----- */
  const cards: Inst[] = [];
  for (let i = 0; i < 90; i++) {
    const x = (rand() * 2 - 1) * 40;
    const z = -34 - rand() * 16;
    const w = 5 + rand() * 5;
    cards.push({ x, y: gy(x, z) - 0.8, z, sx: w, sy: w * (0.55 + rand() * 0.25), sz: 1, c: jit(pick(C.far), 0.12) });
  }
  cards.sort((a, b) => a.z - b.z);

  /* ----- meshes ----- */
  const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, list: Inst[], name: string) => {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
    fillInstances(m, list);
    m.name = name;
    group.add(m);
    return m;
  };
  const hedgeMesh = mk(hedgeG, foliageMat, hedges, 'gardenHedges');
  const hiMesh = mk(blobHiG, foliageMat, blobsHi, 'gardenCrownsHi');
  const loMesh = mk(blobLoG, foliageMat, blobsLo, 'gardenCrownsLo');
  const coneMesh = mk(coneG, foliageMat, cones, 'gardenCones');
  const flowerMesh = mk(flowerG, foliageMat, flowers, 'gardenFlowers');
  const counts = { lo: blobsLo.length, flowers: flowers.length, hi: blobsHi.length };

  const hard = new THREE.Mesh(own(bake.build()), flatMat);
  hard.name = 'gardenHardscape';
  hard.frustumCulled = false;
  group.add(hard);

  // ground: heightfield with a painted map (lawn stripes, terrace slabs, beds, gravel path, contact shadows)
  {
    const { x0, x1, z0, z1 } = TERRAIN;
    const xs: number[] = [];
    for (let x = x0; x < x1 - 0.2; x += 0.5 + 0.06 * Math.abs(x)) {
      xs.push(x);
    }
    xs.push(x1);
    const zs: number[] = [];
    for (let z = z0; z > z1 + 0.2; z -= Math.min(2, 0.45 + 0.07 * (-z + z0))) {
      zs.push(z);
    }
    zs.push(z1);
    const nx = xs.length;
    const pos = new Float32Array(nx * zs.length * 3);
    const uv = new Float32Array(nx * zs.length * 2);
    zs.forEach((z, j) =>
      xs.forEach((x, i) => {
        const k = j * nx + i;
        pos[k * 3] = x;
        pos[k * 3 + 1] = groundY(x, z);
        pos[k * 3 + 2] = z;
        uv[k * 2] = (x - x0) / (x1 - x0);
        uv[k * 2 + 1] = 1 - (z0 - z) / (z0 - z1);
      })
    );
    const idx: number[] = [];
    for (let j = 0; j < zs.length - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i;
        const b = a + 1;
        const c = a + nx;
        const d = c + 1;
        idx.push(a, b, d, a, d, c);
      }
    }
    const tg = own(new THREE.BufferGeometry());
    tg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    tg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    tg.setIndex(idx);
    tg.computeBoundingSphere();
    const mapW = hiQ ? 2048 : 1024;
    const groundTex = own(makeGroundTexture(mapW, Math.round((mapW * (z0 - z1)) / (x1 - x0)), plan, opts.aniso));
    groundTex.anisotropy = Math.min(8, opts.aniso);
    const ground = new THREE.Mesh(tg, own(gardenMaterial({ map: groundTex }, U)));
    ground.name = 'gardenGround';
    ground.frustumCulled = false;
    group.add(ground);
  }

  // sky dome (inside faces), pale sun glow, clouds
  const skyTex = own(makeSkyTexture(SKY_THETA));
  const dome = new THREE.Mesh(
    own(new THREE.SphereGeometry(SKY_R, 40, 14, Math.PI, Math.PI, 0, SKY_THETA)),
    own(gardenMaterial({ map: skyTex, side: THREE.BackSide }, U, { haze: false }))
  );
  dome.position.set(0, 0, -5);
  dome.name = 'gardenSky';
  dome.frustumCulled = false;
  group.add(dome);

  const sunMat = own(
    gardenMaterial(
      { map: opts.glow, color: 0xfff0c8, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false },
      U,
      { haze: false }
    )
  );
  const sun = new THREE.Mesh(own(new THREE.PlaneGeometry(46, 46)), sunMat);
  sun.position.set(9, 15, -57);
  sun.renderOrder = -5;
  sun.frustumCulled = false;
  sun.name = 'gardenSun';
  group.add(sun);

  const cloudTex = own(makeCloudTexture());
  const cloudMat = own(
    gardenMaterial({ map: cloudTex, color: C.cloud.getHex(), transparent: true, opacity: 0.92, depthWrite: false }, U, { haze: false })
  );
  const CLOUDS = [
    [-48, 14, 26, 8, 0.32],
    [-22, 19, 20, 6, 0.26],
    [-4, 11.5, 24, 7, 0.36],
    [16, 17, 28, 8.5, 0.28],
    [38, 12.5, 22, 7, 0.34],
    [56, 20, 26, 7.5, 0.3],
  ];
  const clouds = new THREE.InstancedMesh(own(new THREE.PlaneGeometry(1, 1)), cloudMat, CLOUDS.length);
  clouds.renderOrder = -4;
  clouds.frustumCulled = false;
  clouds.name = 'gardenClouds';
  clouds.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(clouds);
  const cloudX = CLOUDS.map((c) => c[0]);

  // soft far tree-line cards
  const cardGeo = own(new THREE.PlaneGeometry(1, 1));
  cardGeo.translate(0, 0.5, 0);
  const cardTex = own(makeFoliageCardTexture());
  const cardMat = own(gardenMaterial({ map: cardTex, transparent: true, depthWrite: false }, U));
  const cardMesh = new THREE.InstancedMesh(cardGeo, cardMat, cards.length);
  fillInstances(cardMesh, cards);
  cardMesh.renderOrder = -2;
  cardMesh.name = 'gardenTreeLine';
  group.add(cardMesh);

  // tiny birds crossing far away
  const birdPos = [-1, 0.3, 0, 0, 0, 0, -0.45, -0.1, 0, 0, 0, 0, 0, 0, 0, 1, 0.3, 0, 0, 0, 0, 0.45, -0.1, 0, 0, 0, 0];
  const birdGeo = own(new THREE.BufferGeometry());
  birdGeo.setAttribute('position', new THREE.Float32BufferAttribute(birdPos, 3));
  const birdMat = own(gardenMaterial({ color: C.bird.getHex(), side: THREE.DoubleSide }, U));
  const BIRDS = [
    { y: 9, z: -36, v: 3.2, cycle: 70, off: 8, ph: 0, s: 0.55 },
    { y: 12.5, z: -44, v: 2.6, cycle: 95, off: 40, ph: 2, s: 0.6 },
    { y: 7.5, z: -33, v: 3.8, cycle: 60, off: 31, ph: 4, s: 0.5 },
    { y: 10.5, z: -40, v: 3, cycle: 82, off: 66, ph: 1, s: 0.52 },
  ];
  const birds = new THREE.InstancedMesh(birdGeo, birdMat, BIRDS.length);
  birds.frustumCulled = false;
  birds.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  birds.name = 'gardenBirds';
  group.add(birds);

  // pollen / petals drifting in front of the glass
  const POLLEN = 70;
  const pp = new Float32Array(POLLEN * 3);
  const pseed = new Float32Array(POLLEN * 3);
  for (let i = 0; i < POLLEN; i++) {
    pp[i * 3] = (rand() * 2 - 1) * 4.2;
    pp[i * 3 + 1] = 0.9 + rand() * 2.6;
    pp[i * 3 + 2] = -5 - rand() * 5;
    pseed[i * 3] = rand() * 6.28;
    pseed[i * 3 + 1] = 0.02 + rand() * 0.05;
    pseed[i * 3 + 2] = 0.3 + rand() * 0.6;
  }
  const pollenGeo = own(new THREE.BufferGeometry());
  const pollenAttr = new THREE.BufferAttribute(pp, 3);
  pollenAttr.setUsage(THREE.DynamicDrawUsage);
  pollenGeo.setAttribute('position', pollenAttr);
  const POLLEN_OP = 0.75;
  const pollenMat = own(
    new THREE.PointsMaterial({
      map: opts.glow,
      color: 0xfff1c9,
      size: 0.1,
      transparent: true,
      opacity: POLLEN_OP,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    })
  );
  const pollen = new THREE.Points(pollenGeo, pollenMat);
  pollen.frustumCulled = false;
  pollen.renderOrder = 2;
  pollen.name = 'gardenPollen';
  group.add(pollen);

  /* ----- animation ----- */
  const D = new THREE.Object3D();
  let quality = opts.quality;
  let bright = 1;

  const animate = (t: number, dt: number) => {
    U.uTime.value = t;
    const step = Math.min(dt, 0.05);
    for (let i = 0; i < CLOUDS.length; i++) {
      const c = CLOUDS[i];
      cloudX[i] += c[4] * step;
      if (cloudX[i] > 66) {
        cloudX[i] = -66;
      }
      D.position.set(cloudX[i], c[1], -53);
      D.scale.set(c[2], c[3], 1);
      D.updateMatrix();
      clouds.setMatrixAt(i, D.matrix);
    }
    clouds.instanceMatrix.needsUpdate = true;
    if (quality !== 'high') {
      return;
    }
    for (let i = 0; i < BIRDS.length; i++) {
      const b = BIRDS[i];
      const run = 150 / b.v;
      const ph = (t + b.off) % b.cycle;
      const on = ph < run;
      const x = -75 + ph * b.v;
      D.position.set(on ? (i % 2 ? -x : x) : 0, b.y + Math.sin(ph * 0.6 + b.ph) * 0.8, b.z);
      const flap = Math.sin(t * 9 + b.ph);
      D.scale.set(on ? b.s * (i % 2 ? -1 : 1) : 0, on ? b.s * (0.15 + 0.9 * flap) : 0, 1);
      D.updateMatrix();
      birds.setMatrixAt(i, D.matrix);
    }
    birds.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < POLLEN; i++) {
      const o = i * 3;
      pp[o + 1] += pseed[o + 1] * step * 0.8;
      pp[o] += Math.sin(t * pseed[o + 2] + pseed[o]) * 0.0035 + 0.0012;
      pp[o + 2] += Math.cos(t * pseed[o + 2] * 0.8 + pseed[o]) * 0.0025;
      if (pp[o + 1] > 3.6 || pp[o] > 4.4) {
        pp[o + 1] = 0.85;
        pp[o] = (rand() * 2 - 1) * 4.2;
      }
    }
    pollenAttr.needsUpdate = true;
  };

  const update = (t: number, dt: number) => {
    const calm = !!motion && motion.matches;
    U.uWind.value = calm || quality !== 'high' ? 0 : 1;
    if (!calm) {
      animate(t, dt);
    }
  };

  const setQuality = (q: 'high' | 'low') => {
    quality = q;
    const hi = q === 'high';
    cardMesh.visible = hi;
    birds.visible = hi;
    pollen.visible = hi;
    U.uWind.value = hi ? 1 : 0;
    loMesh.count = hi ? counts.lo : Math.ceil(counts.lo * 0.55);
    hiMesh.count = hi ? counts.hi : Math.ceil(counts.hi * 0.6);
    flowerMesh.count = hi ? counts.flowers : Math.ceil(counts.flowers * 0.5);
  };
  setQuality(quality);
  animate(0, 0);

  const setBrightness = (v: number) => {
    bright = v;
    U.uBright.value = v;
    pollenMat.opacity = POLLEN_OP * Math.min(1, bright);
  };

  const dispose = () => {
    for (const o of owned) {
      o.dispose();
    }
    for (const m of [hedgeMesh, hiMesh, loMesh, coneMesh, flowerMesh, cardMesh, clouds, birds]) {
      m.dispose();
    }
    group.removeFromParent();
  };

  return { group, update, setQuality, setBrightness, dispose };
}
