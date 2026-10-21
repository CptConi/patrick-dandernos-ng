import * as THREE from 'three';
import { Assembly, Kit } from './kit';
import { Hole, V3, gridGeo, skirtingGeo } from './shell-geo';
import { BAY, buildBayWindow } from './shell-bay';
import { CONTACT_Z, buildContactCorner } from './shell-contact';
import { Noise, makeCeilingTexture } from '../procedural-textures';

/** The room is lengthened at the entrance end by this much (m); the lighting set and the wall dressing follow it. */
export const ROOM_EXT = 2.6;

/** Room dimensions (meters). Length runs along Z, entrance end at +Z, far end (bay window) at -Z. */
export const ROOM = {
  halfW: 2.75,
  zFar: -4.5,
  zEnt: 4.5 + ROOM_EXT,
  wallH: 2.7,
  ridgeH: 3.6,
};

/** Underside of the gabled roof above a given x (m): wall height at the eaves, ridge height on the centre line. */
export const roofHeight = (x: number): number =>
  ROOM.wallH + (ROOM.ridgeH - ROOM.wallH) * (1 - Math.min(1, Math.abs(x) / ROOM.halfW));

export interface ShellTextures {
  floor: THREE.Texture;
  floorDetail: THREE.Texture;
  floorTile: [number, number];
  plaster: THREE.Texture;
  ramp: THREE.Texture;
  blob: THREE.Texture;
  glow: THREE.Texture;
  /** Diagonal glare streaks for the bay glass. */
  glare: THREE.Texture;
}

export interface Shell {
  group: THREE.Group;
  /** Materials that read as bright windows (animated glow). */
  windowMats: THREE.MeshBasicMaterial[];
  /** Centre of the bay window, a little inside the room (world) for light placement. */
  contactWindow: THREE.Vector3;
  addBlob(x: number, z: number, w: number, d: number, opacity?: number, rotY?: number): void;
  /** Optional: drops normal maps on 'low' (call from studio-room.setQuality). */
  setQuality?(quality: 'high' | 'low'): void;
}

export function buildShell(k: Kit, tx: ShellTextures): Shell {
  const group = new THREE.Group();
  group.name = 'shell';
  const { halfW, zFar, zEnt, wallH, ridgeH } = ROOM;
  const roomLen = zEnt - zFar;
  const zMid = (zEnt + zFar) / 2;
  // the original room ended at z = 4.5: textures keep their phase there so the far half looks as it always did
  const phase = -ROOM_EXT;
  const BEAM2_Z = 5.4;
  const windowMats: THREE.MeshBasicMaterial[] = [];
  const noise = new Noise(5150);

  /* ----- baked occlusion / variation ----- */
  const roofY = roofHeight;
  const aoAt = (x: number, y: number, z: number, skip: string): number => {
    let a = 1;
    const occ = (d: number, s: number, r: number) => {
      a *= 1 - s * Math.exp(-Math.max(0, d) / r);
    };
    if (skip !== 'floor') {
      occ(y, 0.2, 0.2);
    }
    if (skip !== 'L') {
      occ(x + halfW, 0.2, 0.24);
    }
    if (skip !== 'R') {
      occ(halfW - x, 0.2, 0.24);
    }
    if (skip !== 'F') {
      occ(z - zFar, 0.2, 0.24);
    }
    if (skip !== 'E') {
      occ(zEnt - z, 0.2, 0.24);
    }
    if (skip !== 'roof') {
      occ(roofY(x) - y, 0.18, 0.3);
    }
    // faint painter's variation
    return a * (0.97 + 0.06 * noise.fbm(x * 0.6 + z * 0.7, y * 0.8 + 3.1, 3));
  };
  const wallAO = (skip: string) => (x: number, y: number, z: number) => aoAt(x, y, z, skip);
  const roofAO = (x: number, y: number, z: number) => {
    let a = aoAt(x, y, z, 'roof');
    // soft shadow beside the ridge beam
    a *= 1 - 0.24 * Math.exp(-Math.max(0, Math.abs(x) - 0.07) / 0.2);
    return a;
  };
  const floorAO = (x: number, _y: number, z: number) => {
    let a = aoAt(x, 0, z, 'floor');
    a = 1 - (1 - a) * 0.8;
    const big = noise.fbm(x * 0.28 + 4, z * 0.28 + 9, 3);
    return a * (0.84 + 0.32 * big);
  };
  // slightly glossier boards in front of the glazing
  const floorGloss = (x: number, _y: number, z: number) => {
    const near = Math.exp(-Math.pow(x / 2.6, 2)) * Math.exp(-Math.pow((z - zFar - 1.2) / 1.7, 2));
    return 1 - 0.22 * near;
  };

  /* ----- textures & materials ----- */
  const plaster = tx.plaster;
  plaster.repeat.set(0.5, 0.5);
  const plasterN = (plaster.userData.normal as THREE.Texture | undefined) || undefined;
  if (plasterN) {
    plasterN.repeat.set(0.5, 0.5);
    k.tex(plasterN);
  }
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0xf1ede6,
    roughness: 0.95,
    map: plaster,
    normalMap: plasterN || null,
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  wallMat.normalScale.set(0.2, 0.2);

  const ceilTex = k.tex(makeCeilingTexture(k.aniso));
  ceilTex.repeat.set(1 / 2.4, 1 / 2.4);
  const ceilN = ceilTex.userData.normal as THREE.Texture;
  ceilN.repeat.set(1 / 2.4, 1 / 2.4);
  k.tex(ceilN);
  const ceilMat = new THREE.MeshStandardMaterial({
    color: 0xeeeae3,
    roughness: 0.96,
    map: ceilTex,
    normalMap: ceilN,
    vertexColors: true,
    side: THREE.DoubleSide,
    emissive: 0xd6cfc4,
    emissiveIntensity: 0.1,
  });
  ceilMat.normalScale.set(0.12, 0.12);
  k.registerDim({ color: ceilMat.emissive });
  const white = k.std(0xf2efe9, 0.8);
  const skirt = k.std(0x111214, 0.45);
  const jambMat = new THREE.MeshStandardMaterial({ color: 0xe4e0d8, roughness: 0.92, side: THREE.DoubleSide });

  tx.floor.repeat.set(1 / tx.floorTile[0], 1 / tx.floorTile[1]);
  tx.floorDetail.repeat.set(1 / tx.floorTile[0], 1 / tx.floorTile[1]);
  const floorN = tx.floor.userData.normal as THREE.Texture | undefined;
  if (floorN) {
    floorN.repeat.set(1 / tx.floorTile[0], 1 / tx.floorTile[1]);
    k.tex(floorN);
  }
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0xd2cdc6,
    map: tx.floor,
    roughnessMap: tx.floorDetail,
    roughness: 1,
    normalMap: floorN || null,
    bumpMap: floorN ? null : tx.floorDetail,
    bumpScale: 0.0035,
    metalness: 0.0,
    vertexColors: true,
  });
  floorMat.normalScale.set(0.7, 0.7);
  // per-vertex gloss multiplier on the roughness map
  floorMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGloss;\nvarying float vGloss;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGloss = aGloss;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGloss;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor *= vGloss;');
  };
  floorMat.customProgramCacheKey = () => 'shellFloorGloss';

  /* ----- floor, walls, roof ----- */
  const floor = new THREE.Mesh(
    gridGeo({
      o: [-halfW, 0, zEnt],
      u: [1, 0, 0],
      v: [0, 0, -1],
      uLen: 2 * halfW,
      vLen: roomLen,
      uvOffset: [0, phase],
      ao: floorAO,
      gloss: floorGloss,
      fine: 0.12,
      coarse: 0.5,
      edge: 0.55,
    }),
    floorMat
  );
  floor.name = 'floor';
  floor.receiveShadow = true;
  group.add(floor);

  const wall = (name: string, o: V3, u: V3, uLen: number, vLen: number, mat: THREE.Material, skip: string, extra: Partial<Parameters<typeof gridGeo>[0]> = {}) => {
    const m = new THREE.Mesh(gridGeo({ o, u, v: [0, 1, 0], uLen, vLen, ao: wallAO(skip), ...extra }), mat);
    m.name = name;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };

  // door opening (wall-local metres, see below)
  const DOOR = { z: 1.95, w: 1.04, h: 2.14, depth: 0.13 };

  const rightBaseHoles: Hole[] = [{ u0: DOOR.z - DOOR.w / 2 - zFar, u1: DOOR.z + DOOR.w / 2 - zFar, v0: 0, v1: DOOR.h }];
  // bay window on the far wall (symmetrical about the centre line)
  const bayHole: Hole = {
    u0: halfW - BAY.halfW,
    u1: halfW + BAY.halfW,
    v0: BAY.sillY,
    v1: BAY.topY,
  };

  wall('wallLeft', [-halfW, 0, zEnt], [0, 0, -1], roomLen, wallH, wallMat, 'L', { uvOffset: [phase, 0] });
  wall('wallRight', [halfW, 0, zFar], [0, 0, 1], roomLen, wallH, wallMat, 'R', { holes: rightBaseHoles });
  const gable = (x: number) => wallH + (ridgeH - wallH) * (1 - Math.abs(x - halfW) / halfW);
  wall('wallFar', [-halfW, 0, zFar], [1, 0, 0], 2 * halfW, ridgeH, wallMat, 'F', {
    vMax: gable,
    vFixed: BAY.topY + 0.02,
    holes: [bayHole],
  });
  wall('wallEntrance', [halfW, 0, zEnt], [-1, 0, 0], 2 * halfW, ridgeH, wallMat, 'E', { vMax: gable });

  // roof slopes (boards run down the slope)
  const rise = ridgeH - wallH;
  const sl = Math.hypot(halfW, rise);
  const c = halfW / sl;
  const s = rise / sl;
  const slopeL = new THREE.Mesh(
    gridGeo({ o: [-halfW, wallH, zEnt], u: [0, 0, -1], v: [c, s, 0], uLen: roomLen, vLen: sl, uvOffset: [phase, 0], ao: roofAO, fine: 0.14, coarse: 0.6, edge: 0.7 }),
    ceilMat
  );
  slopeL.name = 'roofLeft';
  slopeL.receiveShadow = true;
  group.add(slopeL);
  const slopeR = new THREE.Mesh(
    gridGeo({ o: [halfW, wallH, zFar], u: [0, 0, 1], v: [-c, s, 0], uLen: roomLen, vLen: sl, ao: roofAO, fine: 0.14, coarse: 0.6, edge: 0.7 }),
    ceilMat
  );
  slopeR.name = 'roofRight';
  slopeR.receiveShadow = true;
  group.add(slopeR);

  /* ----- trims: skirting boards, beams, panel mouldings, outlets ----- */
  const trim = new Assembly();
  const sk = (len: number, x: number, z: number, ry: number) => trim.add(skirt, skirtingGeo(len), x, 0, z, { ry });
  sk(roomLen, -halfW, zMid, 0);
  sk(zEnt - (DOOR.z + DOOR.w / 2), halfW, (DOOR.z + DOOR.w / 2 + zEnt) / 2, Math.PI);
  sk(DOOR.z - DOOR.w / 2 - zFar, halfW, (zFar + DOOR.z - DOOR.w / 2) / 2, Math.PI);
  sk(2 * halfW - 0.038, 0, zFar, -Math.PI / 2);
  sk(2 * halfW - 0.038, 0, zEnt, Math.PI / 2);

  // tie beams and ridge beam (rounded edges), soffit step at the far end; the second tie beam is in the extension
  trim.add(white, k.rbox(2 * halfW - 0.04, 0.2, 0.13, 0.014), 0, 2.88, -2.9);
  trim.add(white, k.rbox(2 * halfW - 0.04, 0.2, 0.13, 0.014), 0, 2.88, BEAM2_Z);
  trim.add(white, k.rbox(0.14, 0.12, roomLen - 0.04, 0.012), 0, ridgeH - 0.06, zMid);
  trim.add(white, k.rbox(2 * halfW - 0.04, 0.12, 0.26, 0.012), 0, 2.74, zFar + 0.14);
  // rafter ends at the eaves
  for (let i = 0; i < 8; i++) {
    const z = -3.6 + i * 1.5;
    trim.add(white, k.box(0.03, 0.04, 0.06), -halfW + 0.02, wallH - 0.02, z);
    trim.add(white, k.box(0.03, 0.04, 0.06), halfW - 0.02, wallH - 0.02, z);
  }

  // white bulkhead above the bay window
  trim.add(white, k.rbox(2 * halfW - 0.04, 0.24, 0.12, 0.012), 0, BAY.topY + 0.19, zFar + 0.06);

  // access hatch + panel mouldings on the entrance wall (thin raised frames)
  const frameRect = (cx: number, cy: number, w: number, h: number, t: number) => {
    const z = zEnt - 0.006;
    trim.add(white, k.box(w, t, 0.012), cx, cy + h / 2, z);
    trim.add(white, k.box(w, t, 0.012), cx, cy - h / 2, z);
    trim.add(white, k.box(t, h, 0.012), cx - w / 2, cy, z);
    trim.add(white, k.box(t, h, 0.012), cx + w / 2, cy, z);
  };
  frameRect(0.55, 2.4, 1.5, 0.62, 0.014);
  frameRect(-1.25, 2.2, 0.95, 0.95, 0.012);
  frameRect(-1.25, 2.2, 0.8, 0.8, 0.006);

  // electrical plates (entrance wall)
  const plate = k.std(0xf4f2ec, 0.55);
  const rocker = k.std(0xe3e0d8, 0.5);
  trim.add(plate, k.rbox(0.085, 0.085, 0.014, 0.008), -0.28, 0.3, zEnt - 0.007);
  trim.add(rocker, k.box(0.05, 0.03, 0.005), -0.28, 0.31, zEnt - 0.015);
  trim.add(k.std(0x1a1b1d, 0.6), k.box(0.016, 0.016, 0.004), -0.295, 0.285, zEnt - 0.016);
  trim.add(k.std(0x1a1b1d, 0.6), k.box(0.016, 0.016, 0.004), -0.265, 0.285, zEnt - 0.016);
  // light switch next to the door
  trim.add(plate, k.rbox(0.085, 0.085, 0.014, 0.008), halfW - 0.007, 1.15, DOOR.z + 0.82, { ry: -Math.PI / 2 });
  trim.add(rocker, k.box(0.03, 0.05, 0.006), halfW - 0.015, 1.15, DOOR.z + 0.82, { ry: -Math.PI / 2 });
  trim.flush(group, { cast: false, name: 'trims' });

  /* ----- bay window (the garden outside is built separately, see garden-exterior.ts) ----- */
  const bay = buildBayWindow(k, { glare: tx.glare, glow: tx.glow }, jambMat, windowMats);
  bay.position.set(0, 0, zFar);
  group.add(bay);

  /* ----- entrance door: grey slab recessed in a white niche ----- */
  const door = new THREE.Group();
  door.name = 'door';
  const slab = k.std(0x565a60, 0.62);
  const slabEdge = k.std(0x474b50, 0.62);
  const chrome = k.std(0xb9bcc0, 0.25, 0.9);
  const dark = k.std(0x2a2c30, 0.6);
  const da = new Assembly();
  const dw = DOOR.w;
  const dz = -DOOR.depth;
  const ja = new Assembly();
  ja.add(jambMat, k.plane(DOOR.depth, DOOR.h), -dw / 2, DOOR.h / 2, dz / 2, { ry: Math.PI / 2 });
  ja.add(jambMat, k.plane(DOOR.depth, DOOR.h), dw / 2, DOOR.h / 2, dz / 2, { ry: -Math.PI / 2 });
  ja.add(jambMat, k.plane(dw, DOOR.depth), 0, DOOR.h, dz / 2, { rx: Math.PI / 2 });
  ja.flush(door, { cast: false });
  // threshold step + inner frame
  da.add(white, k.rbox(dw + 0.04, 0.03, DOOR.depth + 0.02, 0.008), 0, 0.015, dz / 2);
  da.add(white, k.box(0.03, DOOR.h - 0.04, 0.03), -dw / 2 + 0.02, DOOR.h / 2, dz + 0.02);
  da.add(white, k.box(0.03, DOOR.h - 0.04, 0.03), dw / 2 - 0.02, DOOR.h / 2, dz + 0.02);
  da.add(white, k.box(dw - 0.02, 0.03, 0.03), 0, DOOR.h - 0.03, dz + 0.02);
  // slab with a routed panel line, vent grille and lever handle
  da.add(slab, k.box(dw - 0.1, DOOR.h - 0.1, 0.04), 0, DOOR.h / 2 + 0.02, dz + 0.015);
  da.add(slabEdge, k.box(dw - 0.2, DOOR.h - 0.3, 0.006), 0, DOOR.h / 2 + 0.02, dz + 0.04);
  for (let i = 0; i < 6; i++) {
    da.add(dark, k.box(0.3, 0.007, 0.006), 0.06, 0.16 + i * 0.016, dz + 0.04);
  }
  da.add(chrome, k.cyl(0.026, 0.026, 0.012, 14), 0.36, 1.02, dz + 0.052, { rx: Math.PI / 2 });
  da.add(chrome, k.box(0.13, 0.02, 0.02), 0.32, 1.02, dz + 0.072);
  da.add(chrome, k.cyl(0.011, 0.011, 0.03, 8), 0.385, 1.02, dz + 0.062, { rx: Math.PI / 2 });
  da.flush(door, { cast: true });
  door.position.set(halfW, 0, DOOR.z);
  door.rotation.y = -Math.PI / 2;
  group.add(door);

  /* ----- white panel heater on the entrance wall ----- */
  const heater = new Assembly();
  const hw = k.std(0xf3f1ec, 0.5);
  heater.add(hw, k.rbox(0.88, 0.5, 0.085, 0.02), 0, 0.5, 0.062);
  heater.add(k.std(0xdedcd5, 0.55), k.box(0.8, 0.012, 0.008), 0, 0.747, 0.062);
  for (let i = 0; i < 9; i++) {
    heater.add(k.std(0x34363a, 0.6), k.box(0.5, 0.004, 0.004), -0.12, 0.7 - i * 0.014, 0.107);
  }
  heater.add(k.std(0x1d1e21, 0.4), k.box(0.2, 0.06, 0.006), 0.3, 0.7, 0.107);
  heater.add(k.std(0xff7a30, 0.4), k.box(0.008, 0.008, 0.004), 0.37, 0.7, 0.111);
  heater.add(k.std(0x9a9ca0, 0.4, 0.7), k.box(0.05, 0.025, 0.03), -0.34, 0.235, 0.02);
  heater.add(k.std(0x9a9ca0, 0.4, 0.7), k.box(0.05, 0.025, 0.03), 0.34, 0.235, 0.02);
  const hg = new THREE.Group();
  heater.flush(hg, { cast: true });
  hg.position.set(1.45, 0, zEnt);
  hg.rotation.y = Math.PI;
  group.add(hg);

  /* ----- contact corner (wall telephone, shelf, bell) on the right wall, between the portraits cluster and the entrance door ----- */
  const contactCorner = buildContactCorner(k);
  contactCorner.position.set(halfW, 0, CONTACT_Z);
  contactCorner.rotation.y = -Math.PI / 2;
  group.add(contactCorner);

  /* ----- soft contact shadows ----- */
  const rampMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    alphaMap: tx.ramp,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const strip = (cc: V3[]) => {
    const g = new THREE.BufferGeometry();
    const pos: number[] = [];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      pos.push(cc[i][0], cc[i][1], cc[i][2]);
    }
    // uv v = 0 at the wall edge (opaque), 1 away from it
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
    const m = new THREE.Mesh(g, rampMat);
    m.renderOrder = 1;
    group.add(m);
  };
  const w = 0.5;
  const y = 0.004;
  strip([[-halfW, y, zEnt], [-halfW, y, zFar], [-halfW + w, y, zFar], [-halfW + w, y, zEnt]]);
  strip([[halfW, y, zFar], [halfW, y, zEnt], [halfW - w, y, zEnt], [halfW - w, y, zFar]]);
  strip([[-halfW, y, zFar], [halfW, y, zFar], [halfW, y, zFar + w], [-halfW, y, zFar + w]]);
  strip([[halfW, y, zEnt], [-halfW, y, zEnt], [-halfW, y, zEnt - w], [halfW, y, zEnt - w]]);

  const blobMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    alphaMap: tx.blob,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const addBlob = (x: number, z: number, bw: number, bd: number, opacity = 1, rotY = 0) => {
    const m = new THREE.Mesh(blobGeo, blobMat);
    m.position.set(x, 0.006, z);
    m.scale.set(bw, 1, bd);
    m.rotation.y = rotY;
    m.renderOrder = 1;
    void opacity;
    group.add(m);
  };

  const setQuality = (q: 'high' | 'low') => {
    const hi = q === 'high';
    const apply = (m: THREE.MeshStandardMaterial, n: THREE.Texture | null | undefined) => {
      const want = hi ? n || null : null;
      if (m.normalMap !== want) {
        m.normalMap = want;
        m.needsUpdate = true;
      }
    };
    apply(wallMat, plasterN);
    apply(ceilMat, ceilN);
    apply(floorMat, floorN);
  };

  return { group, windowMats, contactWindow: new THREE.Vector3(0.2, 1.8, zFar + 0.9), addBlob, setQuality };
}
