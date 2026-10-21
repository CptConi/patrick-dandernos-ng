import * as THREE from 'three';
import { Kit } from './kit';
import { Bag, PartOpts, canvasTex, makeCanvas, lstd, lin } from './living-util';
import { drawPortraitCrop, withPortrait } from './desk-screen';
import { rng } from '../procedural-textures';

/**
 * Helpers of the workstation dressing: a placement wrapper around the merge Bag (items are described in their own
 * frame and baked into the desk space) and the small canvas textures (keyboard, prints, contact sheets).
 */

export class Place {
  private m = new THREE.Matrix4();
  private t = new THREE.Matrix4();
  private o = new THREE.Object3D();
  private v = new THREE.Vector3();

  constructor(readonly bag: Bag, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, parent?: Place) {
    this.o.position.set(x, y, z);
    this.o.rotation.set(rx, ry, rz);
    this.o.updateMatrix();
    this.m.copy(this.o.matrix);
    if (parent) {
      this.m.premultiply(parent.m);
    }
  }

  /** Child frame (local x, y, z + yaw / pitch / roll). */
  at(x: number, y: number, z: number, ry = 0, rx = 0, rz = 0): Place {
    return new Place(this.bag, x, y, z, ry, rx, rz, this);
  }

  /** Same frame, but into another bag (e.g. the optional "detail" parts). */
  into(bag: Bag): Place {
    const p = new Place(bag);
    p.m.copy(this.m);
    return p;
  }

  add(mat: THREE.Material, geo: THREE.BufferGeometry, x = 0, y = 0, z = 0, o: PartOpts = {}): this {
    const t = this.o;
    t.position.set(x, y, z);
    t.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0);
    t.scale.set(o.sx === undefined ? 1 : o.sx, o.sy === undefined ? 1 : o.sy, o.sz === undefined ? 1 : o.sz);
    t.updateMatrix();
    this.t.multiplyMatrices(this.m, t.matrix);
    this.bag.push(mat, geo, this.t, o);
    return this;
  }

  rod(mat: THREE.Material, a: THREE.Vector3Tuple, b: THREE.Vector3Tuple, r: number, seg = 6, o: PartOpts = {}): this {
    const pa = this.v.set(a[0], a[1], a[2]).applyMatrix4(this.m).toArray() as THREE.Vector3Tuple;
    const pb = this.v.set(b[0], b[1], b[2]).applyMatrix4(this.m).toArray() as THREE.Vector3Tuple;
    this.bag.rod(mat, pa, pb, r, seg, o);
    return this;
  }

  tube(mat: THREE.Material, pts: THREE.Vector3Tuple[], r: number, segs = 20, radial = 5, o: PartOpts = {}): this {
    const world = pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(this.m));
    this.bag.tube(mat, new THREE.CatmullRomCurve3(world), r, segs, radial, o);
    return this;
  }

  /** A plain Group sitting at this frame, for the few parts that cannot go through the bag (glowing meshes). */
  node(parent: THREE.Object3D): THREE.Group {
    const g = new THREE.Group();
    g.applyMatrix4(this.m);
    parent.add(g);
    return g;
  }
}

/** Colour of a vertex-tinted part (the bag multiplies it with a white material): sRGB hex -> room's linear-ish hex. */
export const tint = lin;

/** Neutral white material meant to be coloured per part with `{ color: tint(hex) }`. */
export function tintMat(k: Kit): THREE.MeshStandardMaterial {
  return lstd(k, 0xffffff, 0.62, 0);
}

/* ---------------------------------------------------------------- */
/* Textures                                                          */
/* ---------------------------------------------------------------- */

/** Canvas texture painted once with a placeholder and again when the portrait is decoded. */
export function liveTex(
  k: Kit,
  w: number,
  h: number,
  paint: (ctx: CanvasRenderingContext2D, w: number, h: number, img: HTMLImageElement | null) => void
): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(w, h);
  paint(ctx, w, h, null);
  const t = canvasTex(k, c, { srgb: true, repeat: false });
  withPortrait((img) => {
    paint(ctx, w, h, img);
    t.needsUpdate = true;
  });
  return t;
}

export function deskKeyboardTexture(k: Kit): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(512, 160);
  ctx.fillStyle = '#1a1b1e';
  ctx.fillRect(0, 0, 512, 160);
  const rows: Array<Array<number>> = [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.6],
    [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5],
    [1.8, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.2],
    [2.3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.7],
    [1.3, 1, 1, 1.3, 5.2, 1.3, 1, 1],
  ];
  const unit = 31.2;
  let y = 8;
  rows.forEach((row, r) => {
    const h = r === 0 ? 17 : 21.5;
    let x = 8;
    row.forEach((u) => {
      const w = u * unit - 3;
      ctx.fillStyle = r === 0 ? '#34363c' : '#3d4047';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(x, y, w, 2);
      if (u <= 1.01 && r > 0) {
        ctx.fillStyle = 'rgba(210,214,222,0.5)';
        ctx.fillRect(x + w / 2 - 3, y + h / 2 - 2, 6, 4);
      }
      x += u * unit;
    });
    y += h + 3.6;
  });
  return canvasTex(k, c, { srgb: true, repeat: false });
}

/** Pen-tablet active area with a faint grid. */
export function tabletTexture(k: Kit): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(128, 80);
  ctx.fillStyle = '#131416';
  ctx.fillRect(0, 0, 128, 80);
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  for (let i = 1; i < 8; i++) {
    ctx.strokeRect(i * 16, 0, 0.5, 80);
  }
  for (let i = 1; i < 5; i++) {
    ctx.strokeRect(0, i * 16, 128, 0.5);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.strokeRect(1, 1, 126, 78);
  return canvasTex(k, c, { srgb: true, repeat: false });
}

/** Paper print with a white border and the portrait inside. */
export function printTexture(k: Kit, w: number, h: number, margin: number, fx: number, fy: number, fw: number, flip = false): THREE.CanvasTexture {
  return liveTex(k, w, h, (ctx, cw, ch, img) => {
    ctx.fillStyle = '#f1efe9';
    ctx.fillRect(0, 0, cw, ch);
    const mx = Math.round(cw * margin);
    const my = Math.round(ch * margin);
    if (img) {
      drawPortraitCrop(ctx, img, fx, fy, fw, mx, my, cw - mx * 2, ch - my * 2 - (margin > 0.08 ? my : 0), flip);
    } else {
      const g = ctx.createRadialGradient(cw * 0.7, ch * 0.4, 2, cw * 0.62, ch * 0.5, cw * 0.7);
      g.addColorStop(0, '#8e7d6e');
      g.addColorStop(0.4, '#2f2823');
      g.addColorStop(1, '#0b0a0a');
      ctx.fillStyle = g;
      ctx.fillRect(mx, my, cw - mx * 2, ch - my * 2 - (margin > 0.08 ? my : 0));
    }
  });
}

/** Contact sheet: grid of small frames cut from the portrait, grease-pencil circles on the picks. */
export function contactSheetTexture(k: Kit): THREE.CanvasTexture {
  return liveTex(k, 256, 362, (ctx, cw, ch, img) => {
    const rand = rng(31);
    ctx.fillStyle = '#e9e7e0';
    ctx.fillRect(0, 0, cw, ch);
    ctx.fillStyle = '#2a2a2a';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText("CONTACT SHEET  -  P. D'ANDERNOS  -  SESSION 0412", 10, 15);
    ctx.fillStyle = '#9a9a96';
    ctx.fillRect(10, 20, cw - 20, 1);
    const cols = 4;
    const rows = 7;
    const fw = (cw - 20 - (cols - 1) * 4) / cols;
    const fh = fw * 0.72;
    const gy = (ch - 40 - rows * fh) / (rows - 1);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = 10 + c * (fw + 4);
        const y = 28 + r * (fh + gy);
        ctx.fillStyle = '#0d0d0e';
        ctx.fillRect(x - 1, y - 2, fw + 2, fh + 4);
        const sx = 0.2 + rand() * 0.45;
        const sy = 0.05 + rand() * 0.6;
        const sw = 0.35 + rand() * 0.45;
        if (img) {
          drawPortraitCrop(ctx, img, sx, sy, Math.min(sw, 1 - sx), x, y, fw, fh, rand() < 0.25);
        } else {
          ctx.fillStyle = `rgb(${40 + rand() * 60},${36 + rand() * 50},${32 + rand() * 40})`;
          ctx.fillRect(x, y, fw, fh);
        }
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(x, y + fh - 2, fw, 2);
        ctx.fillStyle = '#d8b45a';
        ctx.font = '5px sans-serif';
        ctx.fillText(String(r * cols + c + 1), x + 1, y + fh + 1.5);
      }
    }
    ctx.strokeStyle = 'rgba(206,40,34,0.9)';
    ctx.lineWidth = 1.6;
    for (const [c, r] of [[1, 2], [3, 4], [0, 5]]) {
      const x = 10 + c * (fw + 4) + fw / 2;
      const y = 28 + r * (fh + gy) + fh / 2;
      ctx.beginPath();
      ctx.ellipse(x, y, fw * 0.62, fh * 0.7, 0.1, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
}

/** Soft radial sprite used by the additive light spills. */
export function spillTexture(k: Kit): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return canvasTex(k, c, { repeat: false });
}
