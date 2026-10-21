import * as THREE from 'three';
import { Assembly, Kit, put } from './kit';
import { lstd } from './living-util';

/**
 * Industrial bay window on the FAR wall (z = -4.5, the wall the overview camera looks at, next to the workstation
 * corner): ~80% of the wall width, dark kneewall of a third of the wall height, white sill ledge, slim black steel grid
 * set deep in the reveal, an opening casement, glass glare and a soft daylight halo; the garden outside is a separate 3D scene (garden-exterior.ts).
 * Shared by the shell, the lights and the station poses.
 */
export const BAY = {
  /** Half width of the opening (x). */
  halfW: 2.2,
  /** Top of the kneewall = bottom of the glazing. */
  sillY: 0.9,
  /** Top of the glazing (just under the soffit beam). */
  topY: 2.58,
  /** Height of the transom. */
  rowY: 1.9,
  cols: 5,
  /** Interior wall plane (the window is built facing +z, i.e. into the room, straight onto the far wall). */
  wallZ: -4.5,
  /** Wall thickness = reveal depth. */
  thick: 0.26,
  /** How far the glazing sits behind the interior wall plane. */
  setback: 0.13,
};

export interface BayTextures {
  glare: THREE.Texture;
  glow: THREE.Texture;
}

/** Local frame: origin on the interior wall plane at the centre of the opening (y = 0 = floor), +z into the room. */
export function buildBayWindow(k: Kit, tx: BayTextures, jamb: THREE.Material, windowMats: THREE.MeshBasicMaterial[]): THREE.Group {
  const g = new THREE.Group();
  g.name = 'bayWindow';
  const { halfW: hw, sillY: y0, topY: y1, rowY, cols, thick, setback } = BAY;
  const gh = y1 - y0;
  const cy = (y0 + y1) / 2;
  const fz = -setback;
  const depth = 0.07;
  const f = 0.056;
  const pitch = (2 * hw) / cols;

  const steel = lstd(k, 0x101114, 0.45, 0.3);
  const steelHi = lstd(k, 0x25272b, 0.38, 0.4);
  const white = k.std(0xf2efe8, 0.72);
  const apron = lstd(k, 0x25272b, 0.5, 0.1);
  const apronHi = lstd(k, 0x303237, 0.46, 0.12);

  /* ----- deep reveal ----- */
  const j = new Assembly();
  j.add(jamb, k.plane(thick, gh), -hw, cy, -thick / 2, { ry: Math.PI / 2 });
  j.add(jamb, k.plane(thick, gh), hw, cy, -thick / 2, { ry: -Math.PI / 2 });
  j.add(jamb, k.plane(2 * hw, thick), 0, y1, -thick / 2, { rx: Math.PI / 2 });
  j.flush(g, { cast: false });

  /* ----- kneewall apron + sill ledge ----- */
  const ap = new Assembly();
  ap.add(apron, k.rbox(2 * hw + 0.14, y0 - 0.04, 0.045, 0.006), 0, (y0 - 0.04) / 2, 0.0225);
  for (let i = 0; i < cols; i++) {
    const x = -hw + pitch * (i + 0.5);
    ap.add(apronHi, k.rbox(pitch - 0.15, y0 - 0.26, 0.014, 0.005), x, (y0 - 0.04) / 2 + 0.02, 0.05);
  }
  ap.flush(g, { cast: false });
  const ledge = new Assembly();
  ledge.add(white, k.rbox(2 * hw + 0.1, 0.04, thick + 0.075, 0.01), 0, y0 - 0.02, (0.075 - thick) / 2);
  ledge.flush(g, { cast: false });

  /* ----- steel grid ----- */
  const a = new Assembly();
  a.add(steel, k.box(2 * hw, 0.06, depth), 0, y0 + 0.03, fz);
  a.add(steel, k.box(2 * hw, f, depth), 0, y1 - f / 2, fz);
  a.add(steel, k.box(f, gh, depth), -hw + f / 2, cy, fz);
  a.add(steel, k.box(f, gh, depth), hw - f / 2, cy, fz);
  const my0 = y0 + 0.06;
  const my1 = y1 - f;
  for (let i = 1; i < cols; i++) {
    const x = -hw + pitch * i;
    a.add(steel, k.box(0.03, my1 - my0, 0.06), x, (my0 + my1) / 2, fz);
    a.add(steel, k.box(0.056, my1 - my0, 0.013), x, (my0 + my1) / 2, fz + 0.03);
  }
  a.add(steel, k.box(2 * hw - 2 * f, 0.03, 0.06), 0, rowY, fz);
  a.add(steel, k.box(2 * hw - 2 * f, 0.056, 0.013), 0, rowY, fz + 0.03);
  // inner rebate line
  a.add(steelHi, k.box(2 * hw - 2 * f, 0.012, 0.01), 0, y1 - f - 0.006, fz + 0.04);
  a.flush(g, { cast: false });

  /* ----- opening casement in the middle bay (lower row) ----- */
  const sx = 0;
  const sw = pitch - 0.05;
  const sBot = my0 + 0.012;
  const sTop = rowY - 0.026;
  const sh = sTop - sBot;
  const scy = (sBot + sTop) / 2;
  const sz = fz + 0.022;
  const s = new Assembly();
  const sf = 0.034;
  s.add(steelHi, k.box(sw, sf, 0.05), sx, sBot + sf / 2, sz);
  s.add(steelHi, k.box(sw, sf, 0.05), sx, sTop - sf / 2, sz);
  s.add(steelHi, k.box(sf, sh, 0.05), sx - sw / 2 + sf / 2, scy, sz);
  s.add(steelHi, k.box(sf, sh, 0.05), sx + sw / 2 - sf / 2, scy, sz);
  // espagnolette: plate, lever and stub on the right stile, two hinges on the left
  const hx = sx + sw / 2 - sf / 2;
  s.add(steel, k.box(0.022, 0.2, 0.008), hx, scy, sz + 0.029);
  s.add(steel, k.cyl(0.009, 0.009, 0.02, 10), hx, scy, sz + 0.04, { rx: Math.PI / 2 });
  s.add(steel, k.box(0.085, 0.015, 0.014), hx - 0.04, scy, sz + 0.052);
  s.add(steel, k.box(0.012, 0.012, 0.03), hx, sBot + 0.14, sz + 0.03);
  for (const dy of [0.16, sh - 0.16]) {
    s.add(steel, k.box(0.024, 0.07, 0.022), sx - sw / 2 + 0.006, sBot + dy, sz + 0.03);
  }
  s.flush(g, { cast: false });

  /* ----- faint reflections, daylight halo (the garden itself lives in garden-exterior.ts) ----- */
  const glareMat = new THREE.MeshBasicMaterial({
    map: tx.glare,
    transparent: true,
    opacity: 0.15,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  k.registerDim(glareMat);
  const glare = new THREE.Mesh(k.plane(2 * hw - 0.1, gh - 0.1), glareMat);
  glare.position.set(0, cy, fz + 0.012);
  glare.renderOrder = 4;
  g.add(glare);

  const haze = new THREE.MeshBasicMaterial({
    map: tx.glow,
    color: 0xfff1d8,
    transparent: true,
    opacity: 0.05,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  k.registerDim(haze);
  const hz = new THREE.Mesh(k.plane(2 * hw + 0.9, gh + 0.5), haze);
  hz.position.set(0, cy + 0.1, 0.05);
  hz.renderOrder = 3;
  g.add(hz);

  g.add(buildSillProps(k, -1.55, y0, -0.015));
  return g;
}

/** A small potted plant and a ceramic mug on the sill. */
function buildSillProps(k: Kit, x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'sillProps';
  g.position.set(x, y, z);
  const pot = k.std(0xdcd8cf, 0.55);
  const soil = lstd(k, 0x2a2019, 0.95);
  const leafA = lstd(k, 0x58903c, 0.6);
  const leafB = lstd(k, 0x3d7430, 0.6);
  const ceramic = new THREE.MeshStandardMaterial({ color: 0xe9dfca, roughness: 0.34, side: THREE.DoubleSide });
  const coffee = k.std(0x2b1b10, 0.25);

  const potGeo = k.geo('sill-pot', () =>
    new THREE.LatheGeometry(
      [[0.001, 0], [0.044, 0], [0.056, 0.09], [0.06, 0.1], [0.052, 0.1], [0.001, 0.094]].map((p) => new THREE.Vector2(p[0], p[1])),
      20
    )
  );
  const pl = new Assembly();
  pl.add(pot, potGeo, 0, 0, 0);
  pl.add(soil, k.cyl(0.052, 0.052, 0.004, 14), 0, 0.094, 0);
  for (let i = 0; i < 22; i++) {
    const t = i * 2.4 + 0.3;
    const h = 0.1 + (i % 5) * 0.03;
    const d = 0.02 + (i % 3) * 0.018;
    const len = 0.1 + (i % 3) * 0.02;
    pl.rod(i % 2 ? leafA : leafB, 0, 0.095, 0, Math.cos(t) * d, h, Math.sin(t) * d, 0.0016, 4);
    pl.add(i % 2 ? leafA : leafB, k.sphere(0.5, 8, 6), Math.cos(t) * (d + 0.03), h + 0.004, Math.sin(t) * (d + 0.03), {
      ry: Math.PI / 2 - t,
      sx: 0.62 * len,
      sy: 0.1 * len,
      sz: 1.0 * len,
    });
  }
  pl.flush(g, { cast: false });

  const mug = new THREE.Group();
  mug.position.set(-0.3, 0, 0.01);
  const mugGeo = k.geo('sill-mug', () =>
    new THREE.LatheGeometry(
      [[0.001, 0], [0.034, 0], [0.038, 0.004], [0.039, 0.082], [0.035, 0.086], [0.032, 0.079], [0.032, 0.012], [0.001, 0.012]].map(
        (p) => new THREE.Vector2(p[0], p[1])
      ),
      18
    )
  );
  put(mug, mugGeo, ceramic, 0, 0, 0);
  put(mug, k.cyl(0.0325, 0.0325, 0.002, 16), coffee, 0, 0.068, 0);
  put(mug, k.geo('sill-mug-handle', () => new THREE.TorusGeometry(0.02, 0.0045, 6, 14, Math.PI * 1.25)), ceramic, 0.037, 0.045, 0, { rz: -Math.PI * 0.6 });
  g.add(mug);
  return g;
}
