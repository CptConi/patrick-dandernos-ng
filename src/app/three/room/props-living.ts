import * as THREE from 'three';
import { Kit, put } from './kit';
import { Bag, wallBlob, lstd, lin } from './living-util';
import { buildSofaRich } from './living-sofa';
import { buildAcousticRich, buildLesPaulRich } from './living-guitars';
import { buildPlantRich } from './living-plant';
import {
  buildCabinetRich,
  buildChairRich,
  buildChestRich,
  buildDeskRich,
  buildPortholeRich,
  buildStool,
} from './living-furniture';

/**
 * Furniture and instruments of the studio. Every builder returns a Group whose origin is on the floor,
 * with its "front" along +Z; the caller places and rotates it.
 *
 * The heavy lifting lives in living-*.ts (sofa, guitars, plant, furniture); this file keeps the public API
 * of the room (same names / signatures) plus the lamp and the wall clock.
 */

export { setLivingQuality } from './living-util';
export { buildStool } from './living-furniture';
/** Optional: feeds the room clock to the desk monitor (it animates on its own clock otherwise). */
export { updateDesk } from './desk-screen';

export function buildSofa(k: Kit): THREE.Group {
  return buildSofaRich(k);
}

export function buildLesPaul(k: Kit): THREE.Group {
  return buildLesPaulRich(k);
}

export function buildAcoustic(k: Kit): THREE.Group {
  return buildAcousticRich(k);
}

export function buildPlant(k: Kit): THREE.Group {
  return buildPlantRich(k);
}

export function buildCabinet(k: Kit, screenTex: THREE.Texture): THREE.Group {
  return buildCabinetRich(k, screenTex);
}

export function buildPorthole(k: Kit): THREE.Group {
  return buildPortholeRich(k);
}

export function buildDesk(k: Kit, screenTex: THREE.Texture): THREE.Group {
  return buildDeskRich(k, screenTex);
}

/** Office chair; also carries the drum stool of studio-02 (see buildStool) so it appears without extra wiring. */
export function buildChair(k: Kit): THREE.Group {
  return buildChairRich(k);
}

export function buildChest(k: Kit): THREE.Group {
  return buildChestRich(k);
}

/* ---------------------------------------------------------------- */
/* Bare-bulb lamp                                                    */
/* ---------------------------------------------------------------- */

export interface LampParts {
  group: THREE.Group;
  bulbMats: THREE.MeshBasicMaterial[];
  sprites: THREE.Sprite[];
  /** Local position of the light centroid. */
  lightLocal: THREE.Vector3;
}

export function buildLamp(k: Kit, glowTex: THREE.Texture): LampParts {
  const group = new THREE.Group();
  group.name = 'bulbLamp';
  const cord = new THREE.MeshStandardMaterial({ color: lin(0x0b0b0c), roughness: 0.75 });
  const socketBlack = lstd(k, 0x131315, 0.38, 0.5);
  const brass = lstd(k, 0xa07d3c, 0.32, 1);
  const bulbMats: THREE.MeshBasicMaterial[] = [];
  const sprites: THREE.Sprite[] = [];

  // ceiling rose
  const rose = k.geo('lamp-rose', () =>
    new THREE.LatheGeometry(
      [[0.001, 3.6], [0.085, 3.6], [0.09, 3.592], [0.07, 3.57], [0.034, 3.56], [0.02, 3.545], [0.001, 3.545]].map(
        (p) => new THREE.Vector2(p[0], p[1])
      ),
      24
    )
  );
  put(group, rose, new THREE.MeshStandardMaterial({ color: lin(0x131315), roughness: 0.4, metalness: 0.5, side: THREE.DoubleSide }), 0, 0, 0, {});

  const bulbs: Array<[number, number, number]> = [
    [-0.13, 2.58, 0.02],
    [0.05, 2.4, -0.04],
    [0.15, 2.64, 0.05],
  ];
  const bulbGeo = k.geo('lamp-bulb', () =>
    new THREE.LatheGeometry(
      [
        [0.001, -0.052], [0.012, -0.048], [0.024, -0.034], [0.031, -0.012], [0.031, 0.012], [0.026, 0.032],
        [0.017, 0.048], [0.0125, 0.06], [0.0125, 0.064],
      ].map((p) => new THREE.Vector2(p[0], p[1])),
      18
    )
  );
  const a = new Bag();
  const fil = new Bag();
  for (let i = 0; i < bulbs.length; i++) {
    const b = bulbs[i];
    // cord hangs from the rose with a slight sag
    const top = new THREE.Vector3(b[0], b[1] + 0.115, b[2]);
    const start = new THREE.Vector3(0.004 * (i - 1), 3.55, 0.004);
    const mid = start.clone().lerp(top, 0.5);
    mid.x += (top.x - start.x) * 0.1 + (i - 1) * 0.02;
    mid.z += (i === 1 ? -0.03 : 0.03);
    const mid2 = start.clone().lerp(top, 0.82);
    a.tube(cord, new THREE.CatmullRomCurve3([start, mid, mid2, top]), 0.0036, 24, 5);
    // brass threaded collar + black socket
    a.add(brass, k.cyl(0.0138, 0.0138, 0.018, 12), b[0], b[1] + 0.068, b[2]);
    a.add(socketBlack, k.cyl(0.018, 0.0165, 0.044, 12), b[0], b[1] + 0.099, b[2]);
    a.add(socketBlack, k.cyl(0.0095, 0.012, 0.03, 10), b[0], b[1] + 0.13, b[2]);
    // filament zigzag
    const pts: THREE.Vector3[] = [];
    for (let j = 0; j < 9; j++) {
      pts.push(new THREE.Vector3(b[0] + (j % 2 ? 0.006 : -0.006), b[1] - 0.012 + j * 0.0056, b[2] + (j % 2 ? 0.002 : -0.002)));
    }
    fil.tube(cord, new THREE.CatmullRomCurve3(pts), 0.0009, 18, 3);
    fil.rod(cord, [b[0] - 0.006, b[1] - 0.012, b[2]], [b[0] - 0.006, b[1] + 0.05, b[2]], 0.0006, 3);
    fil.rod(cord, [b[0] + 0.006, b[1] - 0.012, b[2]], [b[0] + 0.006, b[1] + 0.05, b[2]], 0.0006, 3);
  }
  a.flush(group, { cast: false });
  const filMat = k.glow(0xffa84a, 3.4);
  bulbMats.push(filMat);
  const filMeshes = fil.flush(group, { cast: false });
  for (const m of filMeshes) {
    m.material = filMat;
  }
  for (const b of bulbs) {
    const mat = k.glow(0xffd8a0, 2.4);
    mat.side = THREE.DoubleSide;
    bulbMats.push(mat);
    const m = new THREE.Mesh(bulbGeo, mat);
    m.position.set(b[0], b[1], b[2]);
    group.add(m);
    const sm = new THREE.SpriteMaterial({
      map: glowTex,
      color: 0xffa84d,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    k.registerDim(sm);
    const sp = new THREE.Sprite(sm);
    sp.position.set(b[0], b[1], b[2]);
    sp.scale.set(0.55, 0.55, 0.55);
    group.add(sp);
    sprites.push(sp);
  }
  return { group, bulbMats, sprites, lightLocal: new THREE.Vector3(0.02, 2.5, 0) };
}

/* ---------------------------------------------------------------- */
/* Wall clock                                                        */
/* ---------------------------------------------------------------- */

export interface ClockParts {
  group: THREE.Group;
  hour: THREE.Object3D;
  minute: THREE.Object3D;
}

function handShape(pts: Array<[number, number]>): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    s.lineTo(pts[i][0], pts[i][1]);
  }
  s.closePath();
  return s;
}

export function buildClock(k: Kit, faceTex: THREE.Texture): ClockParts {
  const group = new THREE.Group();
  group.name = 'clock';
  const rim = new THREE.MeshStandardMaterial({
    color: lin(0x18191c),
    roughness: 0.34,
    metalness: 0.75,
    envMapIntensity: 1.2,
    side: THREE.DoubleSide,
  });
  const face = lstd(k, 0xffffff, 0.7, 0, { map: faceTex });
  const glass = new THREE.MeshPhysicalMaterial({
    color: lin(0xffffff),
    roughness: 0.03,
    transparent: true,
    opacity: 0.1,
    envMapIntensity: 2,
    depthWrite: false,
  });
  wallBlob(k, group, 0, 0, 0.002, 0.72, 0.72, 0.4);
  put(group, k.geo('clock-face', () => new THREE.CircleGeometry(0.2, 48)), face, 0, 0, 0.018);
  const rimGeo = k.geo('clock-rim-rich', () => {
    const prof: Array<[number, number]> = [
      [0.19, 0.0], [0.208, 0.0], [0.222, 0.008], [0.229, 0.022], [0.226, 0.036], [0.212, 0.043], [0.2, 0.04], [0.195, 0.028],
      [0.2, 0.02], [0.2, 0.014],
    ];
    return new THREE.LatheGeometry(prof.map((p) => new THREE.Vector2(p[0], p[1])), 56).rotateX(Math.PI / 2);
  });
  put(group, rimGeo, rim, 0, 0, 0, { cast: true });
  put(group, k.geo('clock-glass', () => new THREE.CircleGeometry(0.199, 40)), glass, 0, 0, 0.038, { receive: false });

  const hour = new THREE.Group();
  const minute = new THREE.Group();
  const handMat = lstd(k, 0x0b0b0b, 0.4, 0.3);
  const hourGeo = k.geo('clock-hour', () =>
    new THREE.ExtrudeGeometry(
      handShape([[-0.009, -0.025], [0.009, -0.025], [0.007, 0.03], [0.0, 0.115], [-0.007, 0.03]]),
      { depth: 0.002, bevelEnabled: false }
    )
  );
  const minGeo = k.geo('clock-min', () =>
    new THREE.ExtrudeGeometry(
      handShape([[-0.006, -0.035], [0.006, -0.035], [0.0045, 0.08], [0.0, 0.17], [-0.0045, 0.08]]),
      { depth: 0.002, bevelEnabled: false }
    )
  );
  put(hour, hourGeo, handMat, 0, 0, 0, { receive: false });
  put(minute, minGeo, handMat, 0, 0, 0.004, { receive: false });
  hour.position.z = 0.025;
  minute.position.z = 0.025;
  group.add(hour, minute);
  put(group, k.sphere(0.011, 12, 8), rim, 0, 0, 0.033, { sz: 0.6 });
  return { group, hour, minute };
}
