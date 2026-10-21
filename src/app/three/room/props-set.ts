import * as THREE from 'three';
import { Kit } from './kit';
import { Bake, V3, fold } from './set-geo';
import { Gear, place } from './set-gear';
import { buildMannequin } from './set-mannequin';

/**
 * The lighting set: two painted backdrops on poles (grey on stands, ochre on wall brackets), strip softboxes (one
 * gridded), octabox, beauty dish on a boom, cone spot, stands with castors, cables and the seated mannequin.
 * Built in a local frame as if it stood against a wall at z = -4.5 with the figure facing +Z; the room turns the
 * whole group by PI and parks it at the entrance end (studio-room.ts, SET_X), so the mannequin faces the bay window.
 */

export interface SetTextures {
  grey: THREE.Texture;
  ochre: THREE.Texture;
  diffuser: THREE.Texture;
  diffuserGrid: THREE.Texture;
  /** Optional: omitted means 'high'. */
  quality?: 'high' | 'low';
}

export const MANNEQUIN_POS = new THREE.Vector3(0.95, 0, -3.3);
/** Centre (local x) of the ochre backdrop, beside the grey one. */
const OCHRE_X = 2.64;
/**
 * Octabox and the left strip softbox swapped places: the big octabox now stands beside the mannequin, below the
 * overview camera (which hangs just behind her), and the slim strip takes the old foreground spot.
 */
export const OCTA_AT = { x: 2.35, z: -3.0 };
export const STRIP_B_AT = { x: 3.0, z: -1.9 };

/**
 * Muslin backdrop hanging from a pole: wraps the pole, drops with vertical pleats that relax towards the
 * floor, rolls over a rounded fold and runs along the floor. Local frame: pole axis at (y = hangH, z = 0).
 */
function backdropGeo(width: number, hangH: number, run: number, seed: number, hi: boolean): THREE.BufferGeometry {
  const R = 0.15;
  const rp = 0.024;
  const rows: Array<{ y: number; z: number; pleat: number }> = [];
  // sleeve around the pole
  const nS = hi ? 14 : 8;
  for (let i = 0; i <= nS; i++) {
    const th = 0.25 * Math.PI + (i / nS) * 1.75 * Math.PI;
    rows.push({ y: hangH - rp * Math.cos(th), z: -rp * Math.sin(th), pleat: 0.25 });
  }
  const nV = hi ? 46 : 22;
  const y0 = hangH - rp;
  for (let i = 1; i <= nV; i++) {
    const f = i / nV;
    rows.push({ y: y0 - (y0 - R) * f, z: 0, pleat: 1 - 0.75 * Math.pow(f, 0.7) });
  }
  const nA = hi ? 10 : 6;
  for (let i = 1; i <= nA; i++) {
    const a = (i / nA) * (Math.PI / 2);
    rows.push({ y: R - R * Math.sin(a), z: R - R * Math.cos(a), pleat: 0.22 });
  }
  const nF = hi ? 12 : 6;
  for (let i = 1; i <= nF; i++) {
    rows.push({ y: 0.004, z: R + run * (i / nF), pleat: 0.16 });
  }
  const cum: number[] = [0];
  for (let i = 1; i < rows.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(rows[i].y - rows[i - 1].y, rows[i].z - rows[i - 1].z));
  }
  const total = cum[cum.length - 1];
  const nX = hi ? 110 : 44;
  const pos: number[] = [];
  const uv: number[] = [];
  for (let j = 0; j < rows.length; j++) {
    const r = rows[j];
    const hang = Math.min(1, Math.max(0, r.y / hangH));
    for (let i = 0; i <= nX; i++) {
      const u = i / nX;
      let x = (u - 0.5) * width;
      // gathered on the pole: narrower and with tighter pleats near the top
      x *= 1 - 0.02 * Math.pow(hang, 3);
      const freq = 7 + 6 * hang * hang;
      const amp = (0.006 + 0.026 * hang * hang) * r.pleat;
      const dz = fold(x * freq, r.y * 0.35, seed) * amp + 0.008 * Math.sin(x * 2.1 + seed) * hang;
      // pleats also shift the cloth sideways a little (ridges catch the light)
      const dx = Math.sin(x * freq * 0.5 + seed) * 0.004 * hang;
      pos.push(x + dx, r.y, r.z + dz);
      uv.push(u, 1 - cum[j] / total);
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < rows.length - 1; j++) {
    for (let i = 0; i < nX; i++) {
      const a = j * (nX + 1) + i;
      const b = a + 1;
      const c = a + (nX + 1);
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function blobTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
  g.addColorStop(0, 'rgba(0,0,0,0.85)');
  g.addColorStop(0.5, 'rgba(0,0,0,0.35)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function buildLightingSet(k: Kit, tx: SetTextures): THREE.Group {
  const hi = tx.quality !== 'low';
  const root = new THREE.Group();
  root.name = 'lightingSet';

  const G = new Gear(k, tx, hi);
  const MP = MANNEQUIN_POS;
  const aim = (x: number, z: number) => Math.atan2(MP.x - x, MP.z - z);

  /* ----- backdrops ----- */
  const mkCloth = (map: THREE.Texture) =>
    hi
      ? new THREE.MeshPhysicalMaterial({ map, roughness: 0.94, sheen: 0.22, sheenRoughness: 0.8, sheenColor: new THREE.Color(0x4a4e55), side: THREE.DoubleSide })
      : new THREE.MeshStandardMaterial({ map, roughness: 0.94, side: THREE.DoubleSide });
  const cloth = (name: string, map: THREE.Texture, cx: number, cz: number, w: number, hang: number, run: number, seed: number) => {
    const m = new THREE.Mesh(backdropGeo(w, hang, run, seed, hi), mkCloth(map));
    m.position.set(cx, 0, cz);
    m.name = name;
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
    // rolled hem lying on the floor + cloth pole sleeve stitching
    const hemZ = cz + 0.15 + run;
    G.rubber.tube([[cx - w / 2 + 0.01, 0.006, hemZ], [cx - w / 4, 0.007, hemZ + 0.004], [cx, 0.006, hemZ - 0.003], [cx + w / 4, 0.007, hemZ + 0.003], [cx + w / 2 - 0.01, 0.006, hemZ]], 0.0065, name === 'backdropGrey' ? 0x46494e : 0x2a2724, 24, 6);
    return m;
  };
  cloth('backdropGrey', tx.grey, 0.95, -4.3, 2.0, 2.36, 0.62, 1.3);
  // second roll hung from wall brackets just behind the first one, right next to it
  cloth('backdropOchre', tx.ochre, OCHRE_X, -4.4, 1.3, 2.36, 0.46, 4.1);

  /* ----- poles, cradles and wall brackets ----- */
  const woodB = new Bake();
  const pole = (cx: number, y: number, z: number, len: number) => {
    woodB.rod(cx - len / 2, y, z, cx + len / 2, y, z, 0.0155, 0.0155, 0xc89a62, hi ? 12 : 8);
    for (const e of [-1, 1]) {
      woodB.rod(cx + e * len / 2, y, z, cx + e * (len / 2 + 0.028), y, z, 0.021, 0.021, 0x15161a, 10);
      G.chrome.cyl(0.011, 0.006, 0xd5d9df, cx + e * (len / 2 + 0.031), y, z, { rz: Math.PI / 2 }, 8);
    }
  };
  pole(0.95, 2.36, -4.3, 2.7);
  pole(OCHRE_X, 2.36, -4.4, 1.42);
  const cradle = (x: number, y: number, z: number) => {
    G.dark.rod(x, y - 0.03, z, x, y - 0.03, z + 0.1, 0.009, 0.009, 0x101214, 8);
    G.dark.rod(x, y - 0.026, z, x, y + 0.02, z - 0.032, 0.006, 0.006, 0x101214, 6);
    G.dark.rod(x, y - 0.026, z, x, y + 0.02, z + 0.032, 0.006, 0.006, 0x101214, 6);
    G.chrome.ball(x, y - 0.03, z + 0.1, 0.012, 0xd5d9df, 0.012, 0.012, {}, 8);
  };
  // one leg of each stand points into the room so no foot pokes through the wall behind
  for (const sx of [-0.3, 2.2]) {
    G.stand(sx, -4.2, 2.32, { spread: 0.5, rot: Math.PI / 2 + (sx < 0 ? 0.12 : -0.12) });
    cradle(sx, 2.36, -4.3);
  }
  // wall brackets for the ochre pole
  for (const e of [-1, 1]) {
    const bx0 = OCHRE_X + e * 0.6;
    G.dark.box(0.05, 0.11, 0.012, 0x101214, bx0, 2.33, -4.494);
    G.dark.rod(bx0, 2.33, -4.49, bx0, 2.33, -4.4, 0.009, 0.009, 0x101214, 8);
    G.dark.rod(bx0, 2.334, -4.4, bx0, 2.384, -4.434, 0.006, 0.006, 0x101214, 6);
    G.dark.rod(bx0, 2.334, -4.4, bx0, 2.384, -4.366, 0.006, 0.006, 0x101214, 6);
  }
  // spare wooden pole on the floor along the right wall
  woodB.rod(-1.06, 0.0155, -4.3, -1.1, 0.0155, -3.0, 0.0155, 0.0155, 0xc89a62, 10);

  /* ----- strip softboxes ----- */
  const stripAt = (x: number, z: number, grid: boolean) => {
    const base = place(x, 1.5, z, aim(x, z), 0.1);
    const pin = G.strip(base, { w: 0.36, h: 1.25, depth: 0.58, grid });
    G.stand(pin.x, pin.z, pin.y - 0.03, { spread: 0.55, rot: grid ? 2.4 : 1.2 });
    return pin;
  };
  const pinB = stripAt(STRIP_B_AT.x, STRIP_B_AT.z, false);
  const pinG = stripAt(-0.35, -2.5, true);

  /* ----- octabox: side light right next to the mannequin ----- */
  const octaPin = G.octa(place(OCTA_AT.x, 1.75, OCTA_AT.z, aim(OCTA_AT.x, OCTA_AT.z), 0.14), { r: 0.5, depth: 0.42 });
  G.stand(octaPin.x, octaPin.z, octaPin.y - 0.03, { spread: 0.58, rot: 0.3, wheels: true, heavy: true });

  /* ----- cone spot on a tall wheeled stand ----- */
  const spotBase = place(-0.35, 2.4, -3.55, aim(-0.35, -3.55), 0.42);
  G.monolight(spotBase, { body: 0xb3b7bd, len: 0.3, barrel: true });
  const spotPin = G.yoke(spotBase, 0.115, -0.16);
  G.stand(spotPin.x, spotPin.z, spotPin.y - 0.03, { spread: 0.55, rot: 1.9, wheels: true, heavy: true });

  /* ----- boom + beauty dish ----- */
  const bx = 1.7;
  const bz = -3.8;
  const dishPos = V3(MP.x, 1.96, MP.z - 0.05);
  G.dish(place(dishPos.x, dishPos.y, dishPos.z, 0, 0));
  G.stand(bx, bz, 2.2, { spread: 0.62, rot: 0.9, wheels: true, heavy: true });
  const pv = V3(bx, 2.24, bz);
  const tip = V3(dishPos.x + 0.075, 2.17, dishPos.z);
  const dir = tip.clone().sub(pv).setY(0).normalize();
  G.dark.cyl(0.032, 0.07, 0x0c0d0f, bx, 2.22, bz, {}, 12);
  G.chrome.ball(bx, 2.26, bz, 0.017, 0xd5d9df, 0.017, 0.017, {}, 10);
  G.dark.rod(pv.x - dir.x * 0.38, pv.y + 0.012, pv.z - dir.z * 0.38, tip.x, tip.y, tip.z, 0.0125, 0.0105, 0x15171a, 10);
  G.chrome.rod(tip.x - dir.x * 0.1, tip.y, tip.z - dir.z * 0.1, tip.x, tip.y, tip.z, 0.016, 0.016, 0xd5d9df, 10);
  G.dark.ball(tip.x, tip.y, tip.z, 0.024, 0x0c0d0f, 0.024, 0.024, {}, 10);
  // plain counterweight slid on the back of the boom
  G.counterweight(pv.x - dir.x * 0.34, pv.y + 0.012, pv.z - dir.z * 0.34, dir.x, dir.z);

  /* ----- cables + power strip ----- */
  const stripP = V3(1.95, 0, -2.72);
  G.powerStrip(stripP.x, stripP.z, 0.3);
  const run = (pin: THREE.Vector3, path: Array<[number, number]>, off = 0.035) => {
    const pts: Array<[number, number, number]> = [
      [pin.x, pin.y + 0.2, pin.z - 0.06],
      [pin.x + off, pin.y - 0.1, pin.z + 0.01],
      [pin.x + off * 1.2, pin.y * 0.6, pin.z + 0.035],
      [pin.x + off, 0.14, pin.z + 0.04],
    ];
    for (const p of path) {
      pts.push([p[0], 0.006, p[1]]);
    }
    G.cable(pts);
  };
  run(pinB, [[2.9, -1.7], [2.8, -2.3], [2.4, -2.62], [2.0, -2.66]], 0.04);
  run(octaPin, [[2.4, -2.8], [2.15, -2.55], [1.8, -2.62], [1.78, -2.7]]);
  run(spotPin, [[-0.15, -3.45], [0.2, -3.0], [0.85, -2.6], [1.5, -2.55], [1.78, -2.68]], 0.03);
  run(pinG, [[-0.2, -2.3], [0.4, -2.2], [1.2, -2.3], [1.78, -2.68]], 0.03);
  // mains lead from the strip disappearing under the grey backdrop
  G.cable([[1.95, 0.02, -2.72], [2.0, 0.006, -3.0], [1.75, 0.006, -3.3], [1.5, 0.006, -3.5], [1.45, 0.002, -3.64], [1.45, -0.004, -3.8]], 0.0055);
  // dish strobe lead down the boom stand
  G.cable([[dishPos.x, 2.31, dishPos.z], [dishPos.x + 0.25, 2.3, dishPos.z - 0.1], [bx - 0.1, 2.0, bz + 0.03], [bx + 0.02, 1.0, bz + 0.03], [bx + 0.05, 0.12, bz + 0.05], [bx - 0.1, 0.006, bz - 0.15], [bx - 0.7, 0.006, bz - 0.25], [0.95, 0.006, -3.95]], 0.005);

  /* ----- contact shadows ----- */
  const blobMat = new THREE.MeshBasicMaterial({ map: k.tex(blobTexture()), transparent: true, depthWrite: false, opacity: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const blobs = new Bake();
  const blob = (x: number, z: number, r: number, a = 1) => {
    const c = Math.round(255 * (1 - a));
    blobs.geo(k.plane(1, 1), (c << 16) | (c << 8) | c, x, 0.005, z, { rx: -Math.PI / 2, sx: r * 2, sy: r * 2 });
  };
  blob(MP.x, MP.z, 0.36, 0.9);
  blob(MP.x + 0.1, MP.z + 0.3, 0.3, 0.6);
  for (const [sx, sz, r] of [[bx, bz, 0.7], [pinB.x, pinB.z, 0.62], [octaPin.x, octaPin.z, 0.65], [spotPin.x, spotPin.z, 0.62], [pinG.x, pinG.z, 0.62], [-0.3, -4.2, 0.55], [2.2, -4.2, 0.55]] as Array<[number, number, number]>) {
    blob(sx, sz, r, 0.7);
  }

  /* ----- flush merged parts ----- */
  const poleMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.05 });
  woodB.flush(root, poleMat, { cast: true, name: 'backdropPoles' });
  G.flush(root);
  const bm = blobs.flush(root, blobMat, { cast: false, ao: false, name: 'setContactShadows' });
  if (bm) {
    bm.renderOrder = 1;
  }

  root.add(buildMannequin(k, MP, { quality: hi ? 'high' : 'low', aniso: k.aniso }));
  return root;
}
