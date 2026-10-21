import * as THREE from 'three';
import { rng } from '../procedural-textures';

/** Canvas textures for the mannequin: cable-knit and rib maps (colour + normal), embroidered motifs, copper hair. */

function cv(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d') as CanvasRenderingContext2D];
}

function tex(c: HTMLCanvasElement, srgb: boolean, aniso: number): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) {
    t.encoding = THREE.sRGBEncoding;
  }
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  return t;
}

/** Height field (grey canvas) -> tangent-space normal map + ambient-occlusion shaded colour map. */
function bake(height: HTMLCanvasElement, strength: number, base: [number, number, number], aoAmt: number, aniso: number, seed: number): { map: THREE.CanvasTexture; normal: THREE.CanvasTexture } {
  const W = height.width;
  const H = height.height;
  const hd = (height.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, W, H).data;
  const [nc, nctx] = cv(W, H);
  const [cc, cctx] = cv(W, H);
  const nImg = nctx.createImageData(W, H);
  const cImg = cctx.createImageData(W, H);
  const r = rng(seed);
  const hv = (x: number, y: number) => hd[(((y + H) % H) * W + ((x + W) % W)) * 4] / 255;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (hv(x + 1, y) - hv(x - 1, y)) * strength;
      const dy = (hv(x, y + 1) - hv(x, y - 1)) * strength;
      let nx = -dx;
      let ny = dy;
      let nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l;
      ny /= l;
      nz /= l;
      const k = (y * W + x) * 4;
      nImg.data[k] = (nx * 0.5 + 0.5) * 255;
      nImg.data[k + 1] = (ny * 0.5 + 0.5) * 255;
      nImg.data[k + 2] = (nz * 0.5 + 0.5) * 255;
      nImg.data[k + 3] = 255;
      const h = hv(x, y);
      const ao = 1 - aoAmt + aoAmt * Math.pow(h, 0.8);
      const j = 1 + (r() - 0.5) * 0.05;
      cImg.data[k] = Math.min(255, base[0] * ao * j);
      cImg.data[k + 1] = Math.min(255, base[1] * ao * j);
      cImg.data[k + 2] = Math.min(255, base[2] * ao * j);
      cImg.data[k + 3] = 255;
    }
  }
  nctx.putImageData(nImg, 0, 0);
  cctx.putImageData(cImg, 0, 0);
  return { map: tex(cc, true, aniso), normal: tex(nc, false, aniso) };
}

/** Round yarn "rope": nested strokes (dark rim, mid, bright core) along a path. */
function rope(ctx: CanvasRenderingContext2D, path: Array<[number, number]>, w: number): void {
  const draw = (lw: number, v: number) => {
    ctx.lineWidth = lw;
    ctx.strokeStyle = `rgb(${v},${v},${v})`;
    ctx.beginPath();
    ctx.moveTo(path[0][0], path[0][1]);
    if (path.length === 4) {
      ctx.bezierCurveTo(path[1][0], path[1][1], path[2][0], path[2][1], path[3][0], path[3][1]);
    } else {
      for (let i = 1; i < path.length; i++) {
        ctx.lineTo(path[i][0], path[i][1]);
      }
    }
    ctx.stroke();
  };
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  draw(w + 2, 30);
  draw(w, 120);
  draw(w * 0.68, 190);
  draw(w * 0.34, 245);
}

/** Cable-knit sweater tile (0.17 m square): cables, stockinette and rib columns. */
export function makeKnitTile(aniso: number): { map: THREE.CanvasTexture; normal: THREE.CanvasTexture } {
  const S = 512;
  const [hc, ctx] = cv(S, S);
  ctx.fillStyle = 'rgb(70,70,70)';
  ctx.fillRect(0, 0, S, S);
  const r = rng(77);
  // stockinette: V stitches
  const stock = (x0: number, x1: number) => {
    const sw = 12;
    const sh = 15;
    for (let row = -1; row * sh < S + sh; row++) {
      for (let x = x0; x < x1; x += sw) {
        const y = row * sh;
        const j = (r() - 0.5) * 1.2;
        rope(ctx, [[x + 1.5 + j, y + 1], [x + sw / 2 + j, y + sh - 1]], 4.6);
        rope(ctx, [[x + sw - 1.5 + j, y + 1], [x + sw / 2 + j, y + sh - 1]], 4.6);
      }
    }
  };
  // rib: vertical ridges
  const rib = (x0: number, x1: number) => {
    for (let x = x0 + 3; x < x1; x += 8) {
      rope(ctx, [[x, -4], [x + (r() - 0.5) * 0.8, S + 4]], 5.2);
    }
  };
  // cable: two ropes braiding every 192 px
  const cable = (x0: number, w: number) => {
    const cx = x0 + w / 2;
    const half = w / 2 - 12;
    for (let y = -192; y < S + 192; y += 192) {
      rope(ctx, [[cx - half, y], [cx - half, y + 70], [cx + half, y + 120], [cx + half, y + 192]], 21);
      rope(ctx, [[cx + half, y], [cx + half, y + 70], [cx - half, y + 120], [cx - half, y + 192]], 21);
      // fine ply lines along the strands
      ctx.strokeStyle = 'rgba(20,20,20,0.35)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 10; i++) {
        const yy = y + 10 + i * 18;
        ctx.beginPath();
        ctx.moveTo(cx - half - 6, yy);
        ctx.lineTo(cx + half + 6, yy + 4);
        ctx.stroke();
      }
    }
    rope(ctx, [[x0 + 3, -4], [x0 + 3, S + 4]], 5);
    rope(ctx, [[x0 + w - 3, -4], [x0 + w - 3, S + 4]], 5);
  };
  for (const off of [0, 256]) {
    rib(off, off + 24);
    cable(off + 24, 92);
    rib(off + 116, off + 140);
    stock(off + 140, off + 256);
  }
  return bake(hc, 3.2, [236, 228, 211], 0.5, aniso, 11);
}

/** Fine 1x1 rib (hem, cuffs, neckband): vertical ridges, 64 px wide = 8 ribs. */
export function makeRibTile(aniso: number): { map: THREE.CanvasTexture; normal: THREE.CanvasTexture } {
  const S = 128;
  const [hc, ctx] = cv(S, S);
  ctx.fillStyle = 'rgb(60,60,60)';
  ctx.fillRect(0, 0, S, S);
  for (let x = 4; x < S; x += 16) {
    ctx.strokeStyle = 'rgb(30,30,30)';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, S);
    ctx.stroke();
    ctx.strokeStyle = 'rgb(220,220,220)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x + 8, 0);
    ctx.lineTo(x + 8, S);
    ctx.stroke();
    ctx.strokeStyle = 'rgb(255,255,255)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(x + 8, 0);
    ctx.lineTo(x + 8, S);
    ctx.stroke();
  }
  return bake(hc, 3.6, [232, 224, 207], 0.45, aniso, 12);
}

/** Black embroidered butterflies / stars on transparent: u = 0.5 is the front of the sweater, full torso height. */
export function makeMotifDecal(aniso: number): THREE.CanvasTexture {
  const W = 1024;
  const H = 512;
  const [c, ctx] = cv(W, H);
  ctx.clearRect(0, 0, W, H);
  const butterfly = (x: number, y: number, s: number, rot: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(s, s);
    ctx.fillStyle = '#1b1a1e';
    ctx.strokeStyle = '#1b1a1e';
    ctx.lineWidth = 1.6;
    for (const m of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(m * 9, -5, 9, 6.5, m * -0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(m * 7, 6, 6, 4.5, m * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(m, -9);
      ctx.quadraticCurveTo(m * 7, -20, m * 11, -22);
      ctx.stroke();
    }
    ctx.fillRect(-1.5, -9, 3, 20);
    ctx.strokeStyle = 'rgba(210,206,196,0.45)';
    ctx.lineWidth = 0.9;
    for (const m of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(m * 5, -6);
      ctx.lineTo(m * 14, -8);
      ctx.moveTo(m * 5, 5);
      ctx.lineTo(m * 10, 8);
      ctx.stroke();
    }
    ctx.restore();
  };
  const cx = W * 0.5;
  // the front sweater spans v = 0 (hem) .. 1 (neckline); canvas y is flipped (y = (1 - v) * H)
  butterfly(cx - 62, 190, 1.25, -0.5);
  butterfly(cx + 46, 130, 1.0, 0.45);
  butterfly(cx - 8, 292, 0.85, 0.1);
  butterfly(cx + 92, 262, 0.95, 0.9);
  butterfly(cx - 128, 92, 0.85, -0.9);
  butterfly(cx + 150, 196, 0.8, 0.2);
  butterfly(cx - 150, 262, 0.7, -0.3);
  ctx.fillStyle = '#1b1a1e';
  const r = rng(31);
  for (let i = 0; i < 12; i++) {
    ctx.beginPath();
    ctx.arc(cx + (r() - 0.5) * 340, 70 + r() * 290, 1.6 + r() * 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  t.anisotropy = aniso;
  return t;
}

/** Fine black wool crepe (colour only): soft grain, no visible weave. */
export function makeCrepe(aniso: number): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = cv(S, S);
  ctx.fillStyle = '#26262b';
  ctx.fillRect(0, 0, S, S);
  const r = rng(52);
  for (let i = 0; i < 9000; i++) {
    const v = Math.floor(30 + r() * 38);
    ctx.fillStyle = `rgba(${v},${v},${v + 4},${0.18 + r() * 0.25})`;
    ctx.fillRect(r() * S, r() * S, 1 + r() * 1.6, 1 + r() * 1.6);
  }
  return tex(c, true, aniso);
}

/** Deep copper-red hair: fine vertical strands (u around the head, v crown -> tips), darker roots and tips. Also usable as bump map. */
export function makeCopperHair(aniso: number): THREE.CanvasTexture {
  const W = 512;
  const H = 512;
  const [c, ctx] = cv(W, H);
  const r = rng(404);
  ctx.fillStyle = '#86200d';
  ctx.fillRect(0, 0, W, H);
  const palette = ['#4a0e05', '#5e1207', '#741a09', '#8e220d', '#a52c11', '#bb3a17', '#cf4a1e', '#a82d12'];
  for (let i = 0; i < 2600; i++) {
    const x = r() * W;
    const w = 0.6 + r() * 2.0;
    ctx.strokeStyle = palette[Math.floor(r() * palette.length)];
    ctx.globalAlpha = 0.25 + r() * 0.5;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x, r() * H * 0.2);
    ctx.bezierCurveTo(x + (r() - 0.5) * 8, H * 0.35, x + (r() - 0.5) * 10, H * 0.7, x + (r() - 0.5) * 6, H);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(50,8,2,0.5)');
  g.addColorStop(0.18, 'rgba(255,150,80,0.0)');
  g.addColorStop(0.32, 'rgba(255,140,80,0.2)');
  g.addColorStop(0.5, 'rgba(255,130,70,0.0)');
  g.addColorStop(0.88, 'rgba(60,8,3,0.16)');
  g.addColorStop(1, 'rgba(40,6,2,0.5)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  return tex(c, true, aniso);
}

/** Black pump texture, planar top-down (u = x / 0.09 + 0.5, v = z / 0.27): ivory oval = bare instep inside the vamp. */
export function makeShoeTex(aniso: number): THREE.CanvasTexture {
  const W = 128;
  const H = 256;
  const [c, ctx] = cv(W, H);
  ctx.fillStyle = '#0d0d10';
  ctx.fillRect(0, 0, W, H);
  const X = (x: number) => (x / 0.09 + 0.5) * W;
  const Y = (z: number) => (1 - z / 0.27) * H;
  ctx.fillStyle = '#e4d9c9';
  ctx.beginPath();
  ctx.moveTo(X(-0.0165), Y(0.07));
  ctx.quadraticCurveTo(X(-0.0185), Y(0.056), X(0), Y(0.054));
  ctx.quadraticCurveTo(X(0.0185), Y(0.056), X(0.0165), Y(0.07));
  ctx.lineTo(X(0.007), Y(0.118));
  ctx.quadraticCurveTo(X(0), Y(0.126), X(-0.007), Y(0.118));
  ctx.closePath();
  ctx.fill();
  return tex(c, true, aniso);
}
