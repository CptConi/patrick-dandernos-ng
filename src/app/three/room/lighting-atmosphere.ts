import * as THREE from 'three';

/**
 * Faux volumetrics: additive, depthWrite-free frusta of light that leave the windows (and a faint cone for the
 * slideshow spot). Cheap: one draw call per shaft, no per-frame allocation.
 */

type V3 = [number, number, number];

/** Window rectangle on a wall. `axis` is the wall normal axis pointing into the room. */
export interface ShaftWindow {
  /** Wall plane position along the normal axis. */
  wall: number;
  /** Axis of the wall normal: 'x' for side walls, 'z' for end walls. */
  axis: 'x' | 'z';
  /** +1 if the room is on the positive side of the wall, -1 otherwise (light travels toward the room). */
  inward: number;
  /** Lateral range along the wall (z for 'x' walls, x for 'z' walls). */
  u0: number;
  u1: number;
  y0: number;
  y1: number;
  strength: number;
  /** Mullion layout, so the sun patch on the floor shows the window bars. */
  cols: number;
  /** Height of the horizontal bar as a fraction of the glass height (0 = none). */
  bar: number;
}

export interface Atmosphere {
  group: THREE.Group;
  /** Brightness 0..1 of a world point inside any shaft (used to light up dust motes). */
  shaftAmount(x: number, y: number, z: number): number;
  update(t: number, focus: number): void;
  setHighlightCone(from: THREE.Vector3, to: THREE.Vector3, width: number): void;
  dispose(): void;
}

/** Soft-edged, length-faded texture: u = across (hump), v = along the shaft (1 at the window -> 0 at the floor). */
const makeShaftTexture = (): THREE.CanvasTexture => {
  const w = 64;
  const h = 128;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const along = y / (h - 1); // 0 at window
    const fade = Math.pow(1 - along, 1.6) * Math.min(1, along * 14 + 0.25);
    for (let x = 0; x < w; x++) {
      const u = x / (w - 1);
      const hump = Math.pow(Math.sin(Math.PI * u), 0.9);
      // gentle streaks so the shaft does not look like a flat gradient
      const streak = 0.82 + 0.18 * Math.sin(u * 38 + Math.sin(u * 11) * 2);
      const v = Math.max(0, Math.min(1, hump * fade * streak));
      const o = (y * w + x) * 4;
      img.data[o] = 255;
      img.data[o + 1] = 255;
      img.data[o + 2] = 255;
      img.data[o + 3] = Math.round(v * 255);
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
};

/** Sun patch on the floor: soft rounded rectangle with the window bars cut out of it. v = 1 is the window top. */
const makePatchTexture = (cols: number, bar: number): THREE.CanvasTexture => {
  const n = 128;
  const c = document.createElement('canvas');
  c.width = n;
  c.height = n;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const img = g.createImageData(n, n);
  const sm = (a: number, b: number, x: number) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const u = x / (n - 1);
      const v = 1 - y / (n - 1);
      let a = sm(0, 0.12, u) * sm(0, 0.12, 1 - u) * sm(0, 0.12, v) * sm(0, 0.12, 1 - v);
      for (let i = 1; i < cols; i++) {
        a *= 1 - 0.85 * (1 - sm(0.0, 0.022, Math.abs(u - i / cols)));
      }
      if (bar > 0) {
        a *= 1 - 0.85 * (1 - sm(0.0, 0.02, Math.abs(v - bar)));
      }
      const o = (y * n + x) * 4;
      img.data[o] = 255;
      img.data[o + 1] = 255;
      img.data[o + 2] = 255;
      img.data[o + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  t.needsUpdate = true;
  return t;
};

/** Vertical-only gradient for the spot cone (v = 1 at the apex). */
const makeConeTexture = (): THREE.CanvasTexture => {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, 'rgba(255,255,255,0.35)');
  grad.addColorStop(0.08, 'rgba(255,255,255,1)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0.12)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 128);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  t.needsUpdate = true;
  return t;
};

/**
 * Direction of the daylight entering the room (unit, pointing away from the window). The far-wall bay window throws
 * its streaks down the length of the room towards the entrance and the lighting set (slightly drifting towards the
 * gallery wall).
 */
const SUN_END = new THREE.Vector3(-0.1, -0.5, 0.86).normalize();
const SUN_SIDE = new THREE.Vector3(-0.62, -0.55, 0.55).normalize();
const sunDir = (axis: 'x' | 'z', _inward: number): THREE.Vector3 => (axis === 'z' ? SUN_END : SUN_SIDE).clone();

export function buildAtmosphere(windows: ShaftWindow[], opts: { color?: number } = {}): Atmosphere {
  const group = new THREE.Group();
  group.name = 'atmosphere';
  const tex = makeShaftTexture();
  const color = new THREE.Color(opts.color !== undefined ? opts.color : 0xfff1d6);
  const mats: THREE.MeshBasicMaterial[] = [];
  const geos: THREE.BufferGeometry[] = [];
  const texs: THREE.Texture[] = [];
  const shafts: Array<{
    w: ShaftWindow;
    dir: THREE.Vector3;
    mat: THREE.MeshBasicMaterial;
    patch: THREE.MeshBasicMaterial;
    mesh: THREE.Mesh;
    patchMesh: THREE.Mesh;
    base: number;
    phase: number;
  }> = [];

  windows.forEach((w, wi) => {
    const dir = sunDir(w.axis, w.inward);
    const pt = (u: number, y: number): THREE.Vector3 =>
      w.axis === 'x' ? new THREE.Vector3(w.wall, y, u) : new THREE.Vector3(u, y, w.wall);
    // Four window corners, projected along the light to the floor.
    const top = [pt(w.u0, w.y1), pt(w.u1, w.y1), pt(w.u1, w.y0), pt(w.u0, w.y0)];
    const floor = top.map((p) => {
      const t = p.y / -dir.y;
      return p.clone().addScaledVector(dir, t);
    });
    // Side faces of the frustum: between corner i and i+1 (window edge -> its floor footprint).
    const positions: number[] = [];
    const uvs: number[] = [];
    // side faces only: top and bottom faces would sit right in front of the glazing / kneewall and wash them out
    const quads: Array<[number, number]> = [[1, 2], [3, 0]];
    quads.forEach(([a, b]) => {
      const pa = top[a];
      const pb = top[b];
      const fa = floor[a];
      const fb = floor[b];
      // two triangles: pa pb fb, pa fb fa ; uv.x across (0..1), uv.y = 1 at the window (texture row 0), 0 at the floor
      const v = [pa, pb, fb, pa, fb, fa];
      const t = [[0, 1], [1, 1], [1, 0], [0, 1], [1, 0], [0, 0]];
      v.forEach((p, i) => {
        positions.push(p.x, p.y, p.z);
        uvs.push(t[i][0], t[i][1]);
      });
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geos.push(geo);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      color,
      transparent: true,
      opacity: 0.3 * w.strength,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
      toneMapped: true,
    });
    mats.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `shaft${wi}`;
    mesh.renderOrder = 3;
    mesh.frustumCulled = false;
    group.add(mesh);

    // sun patch where the light lands on the floor
    const patchTex = makePatchTexture(w.cols, w.bar);
    texs.push(patchTex);
    const patchGeo = new THREE.BufferGeometry();
    const f = floor;
    const pp: number[] = [];
    [f[0], f[1], f[2], f[0], f[2], f[3]].forEach((p) => pp.push(p.x, 0.012, p.z));
    patchGeo.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3));
    patchGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0], 2));
    geos.push(patchGeo);
    const patchMat = new THREE.MeshBasicMaterial({
      map: patchTex,
      color,
      transparent: true,
      opacity: 0.34 * w.strength,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    mats.push(patchMat);
    const patch = new THREE.Mesh(patchGeo, patchMat);
    patch.name = `sunPatch${wi}`;
    patch.renderOrder = 2;
    patch.frustumCulled = false;
    group.add(patch);
    shafts.push({ w, dir, mat, patch: patchMat, mesh, patchMesh: patch, base: 0.3 * w.strength, phase: wi * 1.7 });
  });

  // Faint cone from the slideshow spot to the hero frame.
  const coneGeo = new THREE.ConeGeometry(1, 1, 24, 1, true);
  coneGeo.translate(0, -0.5, 0); // apex at origin, opens toward -Y
  geos.push(coneGeo);
  const coneTex = makeConeTexture();
  const coneMat = new THREE.MeshBasicMaterial({
    map: coneTex,
    color: 0xffe2b8,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  mats.push(coneMat);
  const cone = new THREE.Mesh(coneGeo, coneMat);
  cone.name = 'spotCone';
  cone.visible = false;
  cone.frustumCulled = false;
  cone.renderOrder = 3;
  group.add(cone);

  const tmpQ = new THREE.Vector3();
  const tmpDir = new THREE.Vector3();
  const UPV = new THREE.Vector3(0, -1, 0);

  const shaftAmount = (x: number, y: number, z: number): number => {
    let best = 0;
    for (let i = 0; i < shafts.length; i++) {
      const s = shafts[i];
      const w = s.w;
      const d = s.dir;
      const px = w.axis === 'x' ? x : z; // coordinate along the wall normal
      const dn = w.axis === 'x' ? d.x : d.z;
      const t = (px - w.wall) / dn;
      if (t < 0) {
        continue;
      }
      tmpQ.set(x - d.x * t, y - d.y * t, z - d.z * t);
      const u = w.axis === 'x' ? tmpQ.z : tmpQ.x;
      const du = Math.min(u - w.u0, w.u1 - u);
      const dy = Math.min(tmpQ.y - w.y0, w.y1 - tmpQ.y);
      const m = Math.min(du, dy);
      if (m <= -0.1) {
        continue;
      }
      const edge = Math.min(1, (m + 0.1) / 0.3);
      // brighter near the window, gone by the time the light reaches the floor
      const along = Math.max(0, 1 - y / Math.max(0.5, w.y1));
      const v = edge * (0.35 + 0.65 * Math.min(1, along * 1.4)) * w.strength;
      if (v > best) {
        best = v;
      }
    }
    return best > 1 ? 1 : best;
  };

  const update = (t: number, focus: number) => {
    // slideshow: the additive haze is fully off, so it never tints the photo
    const k = Math.max(0, 1 - focus);
    for (const s of shafts) {
      const breath = 1 + 0.1 * Math.sin(t * 0.5 + s.phase) + 0.05 * Math.sin(t * 1.3 + s.phase * 2);
      s.mat.opacity = s.base * k * breath;
      s.patch.opacity = (s.base * 1.15) * k * breath;
      s.mesh.visible = k > 0.005;
      s.patchMesh.visible = k > 0.005;
    }
    // the spot cone only lights up while the camera flies in, and is gone once the photo is on screen
    const cone01 = Math.sin(Math.PI * Math.min(1, Math.max(0, focus)));
    coneMat.opacity = 0.2 * cone01;
    cone.visible = cone01 > 0.01;
  };

  const setHighlightCone = (from: THREE.Vector3, to: THREE.Vector3, width: number) => {
    tmpDir.subVectors(to, from);
    const len = tmpDir.length();
    cone.position.copy(from);
    cone.quaternion.setFromUnitVectors(UPV, tmpDir.normalize());
    cone.scale.set(width, len, width);
  };

  const dispose = () => {
    geos.forEach((g) => g.dispose());
    mats.forEach((m) => m.dispose());
    tex.dispose();
    coneTex.dispose();
    texs.forEach((t) => t.dispose());
  };

  return { group, shaftAmount, update, setHighlightCone, dispose };
}

export const SHAFT_WINDOWS: ShaftWindow[] = [
  // far-wall bay window (three groups of bays, split on the mullions)
  { wall: -4.47, axis: 'z', inward: 1, u0: -2.16, u1: -0.47, y0: 0.95, y1: 2.55, strength: 0.62, cols: 2, bar: 0.59 },
  { wall: -4.47, axis: 'z', inward: 1, u0: -0.41, u1: 0.41, y0: 0.95, y1: 2.55, strength: 0.5, cols: 1, bar: 0.59 },
  { wall: -4.47, axis: 'z', inward: 1, u0: 0.47, u1: 2.16, y0: 0.95, y1: 2.55, strength: 0.62, cols: 2, bar: 0.59 },
];

export type { V3 };
