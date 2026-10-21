import * as THREE from 'three';
import { Kit } from './kit';
import { canvasTex, makeCanvas, onLivingQuality } from './living-util';

/**
 * The workstation monitor: a retouching-software mock-up (dark UI, filmstrip, histogram, sliders, spot-healing
 * brush) drawn with canvas 2D around Patrick's portrait. The static chrome is pre-rendered once; only the
 * animated bits are redrawn, at most 8 times a second, and only while the screen is rendered by a camera
 * that is close enough (driven from the mesh's onBeforeRender, so nothing has to be wired into the room loop).
 */

const PORTRAIT_URL = 'assets/images/about-picture-crop.jpg';

let portrait: HTMLImageElement | null = null;
let portraitState = 0; // 0 idle, 1 loading, 2 ready, 3 failed
const waiters: Array<(img: HTMLImageElement) => void> = [];

/** Runs `cb` once the portrait is decoded (immediately when it already is). Never runs when loading fails. */
export function withPortrait(cb: (img: HTMLImageElement) => void): void {
  if (portrait) {
    cb(portrait);
    return;
  }
  if (portraitState === 3) {
    return;
  }
  waiters.push(cb);
  if (portraitState === 0) {
    portraitState = 1;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      portrait = img;
      portraitState = 2;
      for (const w of waiters.splice(0)) {
        w(img);
      }
    };
    img.onerror = () => {
      portraitState = 3;
      waiters.length = 0;
    };
    img.src = PORTRAIT_URL;
  }
}

/** Draws a relative crop (fx, fy = top-left, fw = width as a fraction of the image) of the portrait into a box. */
export function drawPortraitCrop(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  fx: number,
  fy: number,
  fw: number,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  flip = false
): void {
  const sw = img.width * fw;
  const sh = (sw * dh) / dw;
  if (flip) {
    ctx.save();
    ctx.translate(dx + dw, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(img, img.width * fx, img.height * fy, sw, sh, 0, 0, dw, dh);
    ctx.restore();
  } else {
    ctx.drawImage(img, img.width * fx, img.height * fy, sw, sh, dx, dy, dw, dh);
  }
}

/* ---------------------------------------------------------------- */
/* Layout                                                            */
/* ---------------------------------------------------------------- */

const W = 1024;
const H = 576;
const FONT = '-apple-system, "Segoe UI", Helvetica, Arial, sans-serif';
const TWO_PI = Math.PI * 2;
const PH = { x: 153, y: 83, w: 596, h: 430 };
const RX = 794;
const RW = 218;
const HIST = { x: RX, y: 66, w: RW, h: 82 };
const CURVE = { x: RX, y: 452, w: RW, h: 70 };
const SLIDER_Y = 214;
const SLIDER_H = 21;
const PROG = { x: 232, y: 560, w: 150, h: 6 };
const BINS = 64;
const COL = {
  bg: '#1b1b1b',
  panel: '#2a2a2a',
  head: '#333333',
  line: '#121212',
  text: '#b2b2b2',
  dim: '#7a7a7a',
  hi: '#ececec',
  accent: '#4aa3ff',
};

interface SliderDef {
  label: string;
  lo: number;
  hi: number;
  val: number;
  dec: number;
  signed: boolean;
  amp: number;
  sp: number;
  ph: number;
}

const SLIDERS: SliderDef[] = [
  { label: 'Temp', lo: 2000, hi: 12000, val: 5600, dec: 0, signed: false, amp: 0, sp: 0, ph: 0 },
  { label: 'Tint', lo: -150, hi: 150, val: 8, dec: 0, signed: true, amp: 0, sp: 0, ph: 0 },
  { label: 'Exposure', lo: -5, hi: 5, val: 0.35, dec: 2, signed: true, amp: 0.6, sp: 0.33, ph: 0 },
  { label: 'Contrast', lo: -100, hi: 100, val: 24, dec: 0, signed: true, amp: 0, sp: 0, ph: 0 },
  { label: 'Highlights', lo: -100, hi: 100, val: -42, dec: 0, signed: true, amp: 14, sp: 0.23, ph: 1.7 },
  { label: 'Shadows', lo: -100, hi: 100, val: 36, dec: 0, signed: true, amp: 18, sp: 0.29, ph: 3.1 },
  { label: 'Whites', lo: -100, hi: 100, val: 6, dec: 0, signed: true, amp: 0, sp: 0, ph: 0 },
  { label: 'Blacks', lo: -100, hi: 100, val: -18, dec: 0, signed: true, amp: 0, sp: 0, ph: 0 },
  { label: 'Clarity', lo: -100, hi: 100, val: 22, dec: 0, signed: true, amp: 9, sp: 0.19, ph: 4.4 },
  { label: 'Vibrance', lo: -100, hi: 100, val: 9, dec: 0, signed: true, amp: 0, sp: 0, ph: 0 },
];

/* ---------------------------------------------------------------- */
/* Static drawing helpers                                            */
/* ---------------------------------------------------------------- */

function text(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  color: string,
  size = 10,
  align: CanvasTextAlign = 'left',
  weight = ''
): void {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(s, x, y);
}

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function panelHeader(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, label: string): void {
  ctx.fillStyle = COL.head;
  ctx.fillRect(x, y, w, 18);
  ctx.fillStyle = COL.line;
  ctx.fillRect(x, y + 18, w, 1);
  text(ctx, label, x + 12, y + 12.5, COL.text, 9, 'left', '600');
  ctx.beginPath();
  ctx.moveTo(x + w - 18, y + 7);
  ctx.lineTo(x + w - 10, y + 7);
  ctx.lineTo(x + w - 14, y + 12);
  ctx.closePath();
  ctx.fillStyle = COL.dim;
  ctx.fill();
}

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill: string): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function drawSlider(ctx: CanvasRenderingContext2D, i: number, val: number): void {
  const d = SLIDERS[i];
  const y = SLIDER_Y + i * SLIDER_H;
  ctx.fillStyle = COL.panel;
  ctx.fillRect(RX - 6, y, RW + 12, SLIDER_H);
  text(ctx, d.label, RX + 12, y + 14, COL.text, 10);
  const t0 = RX + 76;
  const t1 = RX + RW - 46;
  ctx.fillStyle = '#464646';
  ctx.fillRect(t0, y + 10, t1 - t0, 1.5);
  const frac = (val - d.lo) / (d.hi - d.lo);
  const zero = d.lo < 0 ? -d.lo / (d.hi - d.lo) : 0;
  const kx = t0 + (t1 - t0) * frac;
  const zx = t0 + (t1 - t0) * zero;
  ctx.fillStyle = COL.accent;
  ctx.fillRect(Math.min(kx, zx), y + 10, Math.abs(kx - zx), 1.5);
  ctx.beginPath();
  ctx.arc(kx, y + 10.75, 3.8, 0, TWO_PI);
  ctx.fillStyle = '#dcdcdc';
  ctx.fill();
  const s = (d.signed && val >= 0 ? '+' : '') + val.toFixed(d.dec);
  text(ctx, s, RX + RW - 6, y + 14, COL.hi, 10, 'right');
}

function drawToolIcon(ctx: CanvasRenderingContext2D, i: number, x: number, y: number, active: boolean): void {
  if (active) {
    rrect(ctx, x - 13, y - 11, 26, 22, 4);
    ctx.fillStyle = '#3d3d3d';
    ctx.fill();
  }
  ctx.strokeStyle = active ? COL.accent : '#a8a8a8';
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  switch (i) {
    case 0: // crop
      ctx.moveTo(x - 5, y - 8);
      ctx.lineTo(x - 5, y + 5);
      ctx.lineTo(x + 8, y + 5);
      ctx.moveTo(x - 8, y - 5);
      ctx.lineTo(x + 5, y - 5);
      ctx.lineTo(x + 5, y + 8);
      ctx.stroke();
      break;
    case 1: // spot removal
      ctx.arc(x, y, 6.5, 0, TWO_PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, TWO_PI);
      ctx.fill();
      break;
    case 2: // red eye
      ctx.ellipse(x, y, 8, 5, 0, 0, TWO_PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 2.6, 0, TWO_PI);
      ctx.fillStyle = '#e0584a';
      ctx.fill();
      break;
    case 3: // graduated filter
      ctx.rect(x - 8, y - 6, 16, 12);
      ctx.stroke();
      ctx.moveTo(x - 8, y);
      ctx.lineTo(x + 8, y);
      ctx.stroke();
      break;
    case 4: // radial filter
      ctx.setLineDash([2.5, 2]);
      ctx.ellipse(x, y, 8, 6, 0, 0, TWO_PI);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    default: // adjustment brush
      ctx.moveTo(x - 7, y + 7);
      ctx.lineTo(x + 4, y - 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + 6, y - 6, 2.6, 0, TWO_PI);
      ctx.fill();
  }
  ctx.lineWidth = 1;
}

/* ---------------------------------------------------------------- */
/* The screen                                                        */
/* ---------------------------------------------------------------- */

export interface DeskScreen {
  texture: THREE.CanvasTexture;
  /** Hooks the redraw to the screen mesh: it only runs while that mesh is rendered close to the camera. */
  attach(mesh: THREE.Mesh): void;
}

let clockT = 0;
let clockWired = false;

/** Optional: feed the room clock (seconds). Without it the screen runs on its own clock. */
export function updateDesk(t: number): void {
  clockT = t;
  clockWired = true;
}

const NEAR2 = 8.5 * 8.5;

export function createDeskScreen(k: Kit): DeskScreen {
  const [cv, ctx] = makeCanvas(W, H);
  const [chrome, cx] = makeCanvas(W, H);
  const PW = 880;
  const PHH = Math.round((PW * PH.h) / PH.w);
  const [photo, px] = makeCanvas(PW, PHH);
  const thumbs: HTMLCanvasElement[] = [];
  const hist = new Float32Array(BINS);
  const tex = canvasTex(k, cv, { srgb: true, repeat: false });
  tex.anisotropy = Math.min(k.aniso, 8);
  let animated = true;
  let lastDraw = -1;
  let drawn = false;
  const t0 = performance.now() * 0.001;
  const vig = ctx.createRadialGradient(PH.x + PH.w * 0.6, PH.y + PH.h * 0.45, PH.h * 0.3, PH.x + PH.w * 0.5, PH.y + PH.h * 0.5, PH.h * 0.95);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.55)');

  const THUMB_W = 100;
  const THUMB_H = 78;
  const THUMB_DEF: Array<{ fx: number; fy: number; fw: number; tint: string | null; flip?: boolean }> = [
    { fx: 0.0, fy: 0.04, fw: 1.0, tint: '#5f86d6' },
    { fx: 0.4, fy: 0.268, fw: 0.6, tint: null },
    { fx: 0.62, fy: 0.3, fw: 0.36, tint: '#c79a62' },
    { fx: 0.5, fy: 0.02, fw: 0.5, tint: '#d9a35a' },
    { fx: 0.46, fy: 0.62, fw: 0.54, tint: '#4fa79a', flip: true },
  ];
  const THUMB_Y0 = 72;
  const THUMB_STEP = 96;
  const SELECTED = 1;

  const placeholder = (c: CanvasRenderingContext2D, w: number, h: number) => {
    const g = c.createRadialGradient(w * 0.7, h * 0.42, 4, w * 0.62, h * 0.5, w * 0.6);
    g.addColorStop(0, '#9b8878');
    g.addColorStop(0.35, '#3a322c');
    g.addColorStop(1, '#0a0909');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  };

  const drawChrome = () => {
    const c = cx;
    c.fillStyle = COL.bg;
    c.fillRect(0, 0, W, H);

    // OS menu bar
    c.fillStyle = '#242426';
    c.fillRect(0, 0, W, 22);
    text(c, 'Lightroom', 14, 15, COL.hi, 11, 'left', '700');
    const menus = ['File', 'Edit', 'Photo', 'Settings', 'Tools', 'View', 'Window', 'Help'];
    let mx = 92;
    for (const m of menus) {
      text(c, m, mx, 15, COL.text, 11);
      mx += c.measureText(m).width + 16;
    }
    text(c, 'Tue 10:42', W - 12, 15, COL.text, 11, 'right');
    c.strokeStyle = COL.text;
    c.lineWidth = 1.2;
    c.strokeRect(W - 78, 8, 14, 7);
    c.fillStyle = COL.text;
    c.fillRect(W - 77, 9, 10, 5);
    c.fillRect(W - 63.5, 10.5, 1.6, 2.6);
    for (let i = 1; i <= 3; i++) {
      c.beginPath();
      c.arc(W - 96, 16, i * 3.2, -Math.PI * 0.8, -Math.PI * 0.2);
      c.stroke();
    }
    c.lineWidth = 1;

    // module picker + identity plate
    c.fillStyle = '#212121';
    c.fillRect(0, 22, W, 24);
    c.fillStyle = COL.line;
    c.fillRect(0, 45, W, 1);
    rrect(c, 10, 26, 24, 16, 3);
    c.fillStyle = '#0e0e0e';
    c.fill();
    c.strokeStyle = COL.accent;
    c.stroke();
    text(c, 'Lr', 22, 38, COL.accent, 11, 'center', '700');
    text(c, "Patrick d'Andernos", 44, 37, COL.hi, 12, 'left', '600');
    const mods = ['Library', 'Develop', 'Map', 'Book', 'Slideshow', 'Print', 'Web'];
    let ox = W - 14;
    for (let i = mods.length - 1; i >= 0; i--) {
      const on = mods[i] === 'Develop';
      text(c, mods[i], ox, 38, on ? COL.hi : COL.dim, 11, 'right', on ? '600' : '');
      ox -= c.measureText(mods[i]).width + 12;
      if (i > 0) {
        text(c, '|', ox + 6, 38, '#3c3c3c', 11, 'right');
        ox -= 8;
      }
    }

    // left filmstrip
    c.fillStyle = COL.panel;
    c.fillRect(0, 46, 120, 504);
    c.fillStyle = COL.line;
    c.fillRect(119, 46, 1, 504);
    panelHeader(c, 0, 46, 119, 'FILMSTRIP');
    for (let i = 0; i < THUMB_DEF.length; i++) {
      const y = THUMB_Y0 + i * THUMB_STEP;
      if (thumbs[i]) {
        c.drawImage(thumbs[i], 10, y);
      } else {
        c.save();
        c.translate(10, y);
        placeholder(c, THUMB_W, THUMB_H);
        c.restore();
      }
      const g = c.createLinearGradient(0, y + THUMB_H - 20, 0, y + THUMB_H);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.7)');
      c.fillStyle = g;
      c.fillRect(10, y + THUMB_H - 20, THUMB_W, 20);
      for (let s = 0; s < 5; s++) {
        star(c, 17 + s * 8, y + THUMB_H - 7, 3.3, s < (i === SELECTED ? 5 : 2 + (i % 3)) ? '#e8e8e8' : '#555');
      }
      text(c, String(412 + i), 110 - 3, y + THUMB_H - 4, '#d0d0d0', 8, 'right');
      if (i === SELECTED) {
        c.strokeStyle = COL.accent;
        c.lineWidth = 2;
        c.strokeRect(9, y - 1, THUMB_W + 2, THUMB_H + 2);
        c.lineWidth = 1;
      } else if (i % 2 === 0) {
        c.fillStyle = 'rgba(0,0,0,0.28)';
        c.fillRect(10, y, THUMB_W, THUMB_H - 20);
      }
      if (i === 3) {
        c.fillStyle = '#e0a93a';
        c.fillRect(100, y + 3, 7, 7);
      }
    }

    // centre: tool strip, photo bed, bottom bar
    c.fillStyle = '#2a2a2a';
    c.fillRect(120, 46, RX - 6 - 120, 28);
    c.fillStyle = COL.line;
    c.fillRect(120, 73, RX - 6 - 120, 1);
    for (let i = 0; i < 6; i++) {
      drawToolIcon(c, i, 142 + i * 32, 60, i === 1);
    }
    text(c, 'Heal', 356, 64, COL.hi, 10, 'left', '600');
    text(c, 'Size', 404, 64, COL.dim, 10);
    text(c, '38', 430, 64, COL.text, 10);
    text(c, 'Feather', 462, 64, COL.dim, 10);
    text(c, '52', 504, 64, COL.text, 10);
    text(c, 'Opacity', 532, 64, COL.dim, 10);
    text(c, '100', 574, 64, COL.text, 10);
    text(c, 'Done', RX - 20, 64, COL.hi, 10, 'right', '600');
    c.fillStyle = '#171717';
    c.fillRect(120, 74, RX - 6 - 120, 448);
    c.fillStyle = '#2a2a2a';
    c.fillRect(120, 522, RX - 6 - 120, 28);
    c.fillStyle = COL.line;
    c.fillRect(120, 522, RX - 6 - 120, 1);
    for (let s = 0; s < 5; s++) {
      star(c, 148 + s * 14, 536, 5, s < 4 ? '#eaeaea' : '#555');
    }
    rrect(c, 236, 529, 22, 14, 2);
    c.strokeStyle = COL.dim;
    c.stroke();
    rrect(c, 262, 529, 22, 14, 2);
    c.stroke();
    text(c, 'Y | Y', 322, 540, COL.text, 10, 'left');
    text(c, 'Fit', 540, 540, COL.hi, 10, 'left', '600');
    text(c, 'Fill', 566, 540, COL.dim, 10);
    text(c, '100%', 594, 540, COL.dim, 10);
    text(c, '200%', 630, 540, COL.dim, 10);
    text(c, 'Soft Proofing', RX - 24, 540, COL.text, 10, 'right');

    // right panel
    c.fillStyle = COL.panel;
    c.fillRect(RX - 12, 46, W - RX + 12, 504);
    c.fillStyle = COL.line;
    c.fillRect(RX - 12, 46, 1, 504);
    panelHeader(c, RX - 11, 46, W - RX + 11, 'HISTOGRAM');
    text(c, 'ISO 100    85 mm    f / 2.8    1/200 sec', RX + RW / 2, 160, COL.dim, 9, 'center');
    panelHeader(c, RX - 11, 168, W - RX + 11, 'BASIC');
    text(c, 'WB', RX + 12, 207, COL.text, 10);
    text(c, 'As Shot  ▾', RX + 76, 207, COL.hi, 10);
    for (let i = 0; i < SLIDERS.length; i++) {
      drawSlider(c, i, SLIDERS[i].val);
    }
    panelHeader(c, RX - 11, 430, W - RX + 11, 'TONE CURVE');
    panelHeader(c, RX - 11, 528, W - RX + 11, 'HSL / COLOR');

    // status bar
    c.fillStyle = '#1f1f1f';
    c.fillRect(0, 550, W, 26);
    c.fillStyle = COL.line;
    c.fillRect(0, 550, W, 1);
    text(c, 'Exporting 3 photos', 12, 566, COL.text, 10);
    text(c, 'Portraits 2024  /  248 photos  /  1 selected  /  DSC_0413.NEF', W / 2 + 80, 566, COL.dim, 10, 'center');
    text(c, 'Filter:  ★ ≥ 3    Flagged', W - 14, 566, COL.dim, 10, 'right');
  };

  const buildThumbs = (img: HTMLImageElement) => {
    for (let i = 0; i < THUMB_DEF.length; i++) {
      const d = THUMB_DEF[i];
      const [tc, tx] = makeCanvas(THUMB_W, THUMB_H);
      tx.fillStyle = '#0c0c0c';
      tx.fillRect(0, 0, THUMB_W, THUMB_H);
      drawPortraitCrop(tx, img, d.fx, d.fy, d.fw, 0, 0, THUMB_W, THUMB_H, d.flip);
      if (d.tint) {
        tx.globalCompositeOperation = 'color';
        tx.globalAlpha = 0.85;
        tx.fillStyle = d.tint;
        tx.fillRect(0, 0, THUMB_W, THUMB_H);
        tx.globalAlpha = 1;
        tx.globalCompositeOperation = 'source-over';
      }
      thumbs[i] = tc;
    }
  };

  const computeHist = () => {
    const [sc, sx] = makeCanvas(120, 87);
    sx.drawImage(photo, 0, 0, 120, 87);
    const d = sx.getImageData(0, 0, 120, 87).data;
    hist.fill(0);
    for (let i = 0; i < d.length; i += 4) {
      const l = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255;
      hist[Math.min(BINS - 1, Math.floor(l * BINS))] += 1;
    }
    let mx = 1;
    for (let i = 0; i < BINS; i++) {
      hist[i] = Math.log(1 + hist[i]);
      mx = Math.max(mx, hist[i]);
    }
    for (let i = 0; i < BINS; i++) {
      const a = hist[Math.max(0, i - 1)];
      const b = hist[Math.min(BINS - 1, i + 1)];
      hist[i] = ((a + hist[i] * 2 + b) / 4 / mx) * 0.92 + 0.02;
    }
    void sc;
  };

  const synthHist = () => {
    for (let i = 0; i < BINS; i++) {
      const u = i / (BINS - 1);
      hist[i] = 0.9 * Math.exp(-Math.pow((u - 0.08) / 0.1, 2)) + 0.35 * Math.exp(-Math.pow((u - 0.42) / 0.16, 2)) + 0.18 * Math.exp(-Math.pow((u - 0.8) / 0.12, 2)) + 0.03;
    }
  };

  const loadFrom = (img: HTMLImageElement) => {
    const iw = img.width;
    const ih = img.height;
    const fw = 0.6;
    const sw = iw * fw;
    const sh = (sw * PHH) / PW;
    px.drawImage(img, iw * 0.4, ih * 0.268, sw, sh, 0, 0, PW, PHH);
    buildThumbs(img);
    drawChrome();
    computeHist();
    drawn = false;
    render(clockWired ? clockT : performance.now() * 0.001 - t0);
    tex.needsUpdate = true;
  };

  const HCOL = ['rgba(255,50,50,0.6)', 'rgba(50,255,60,0.6)', 'rgba(70,100,255,0.65)'];

  const render = (t: number) => {
    drawn = true;
    ctx.drawImage(chrome, 0, 0);

    // histogram
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(HIST.x, HIST.y, HIST.w, HIST.h);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (let i = 1; i < 4; i++) {
      ctx.fillRect(HIST.x + (HIST.w * i) / 4, HIST.y, 1, HIST.h);
    }
    const base = HIST.y + HIST.h - 2;
    ctx.globalCompositeOperation = 'lighter';
    for (let ch = 0; ch < 3; ch++) {
      ctx.fillStyle = HCOL[ch];
      ctx.beginPath();
      ctx.moveTo(HIST.x, base);
      for (let i = 0; i < BINS; i++) {
        const v = hist[i] * (1 + 0.07 * Math.sin(t * 1.5 + i * 0.33 + ch * 0.9));
        ctx.lineTo(HIST.x + ((i + (ch - 1) * 0.45) / (BINS - 1)) * HIST.w, base - v * (HIST.h - 12));
      }
      ctx.lineTo(HIST.x + HIST.w, base);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#6a6a6a';
    ctx.fillRect(HIST.x + 4, HIST.y + 4, 6, 6);
    ctx.fillRect(HIST.x + HIST.w - 10, HIST.y + 4, 6, 6);

    // animated sliders
    let exposure = 0;
    for (let i = 0; i < SLIDERS.length; i++) {
      const d = SLIDERS[i];
      if (d.amp > 0) {
        const v = d.val + d.amp * Math.sin(t * d.sp * TWO_PI * 0.3 + d.ph);
        drawSlider(ctx, i, v);
        if (i === 2) {
          exposure = v - d.val;
        }
      }
    }

    // tone curve
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(CURVE.x, CURVE.y, CURVE.w, CURVE.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    for (let i = 1; i < 4; i++) {
      ctx.strokeRect(CURVE.x + (CURVE.w * i) / 4, CURVE.y, 0.5, CURVE.h);
      ctx.strokeRect(CURVE.x, CURVE.y + (CURVE.h * i) / 4, CURVE.w, 0.5);
    }
    const bump = 0.07 * Math.sin(t * 0.55 + 1);
    const cx0 = CURVE.x + 4;
    const cy0 = CURVE.y + CURVE.h - 4;
    const cw = CURVE.w - 8;
    const ch = CURVE.h - 8;
    ctx.strokeStyle = '#e4e4e4';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cx0, cy0);
    ctx.bezierCurveTo(cx0 + cw * 0.28, cy0 - ch * (0.12 + bump), cx0 + cw * 0.62, cy0 - ch * (0.9 - bump), cx0 + cw, cy0 - ch);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.fillStyle = '#e4e4e4';
    ctx.fillRect(cx0 + cw * 0.28 - 2, cy0 - ch * (0.2 + bump) - 2, 4, 4);

    // photo with a slow zoom / pan pulse
    const z = 1.03 + 0.025 * Math.sin(t * 0.42);
    const sw = PW / z;
    const sh = PHH / z;
    ctx.drawImage(photo, (PW - sw) * (0.55 + 0.35 * Math.sin(t * 0.17)), (PHH - sh) * (0.5 + 0.35 * Math.sin(t * 0.13 + 2)), sw, sh, PH.x, PH.y, PH.w, PH.h);
    if (exposure !== 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(190,190,190,${Math.max(0, exposure) * 0.05})`;
      ctx.fillRect(PH.x, PH.y, PH.w, PH.h);
      ctx.globalCompositeOperation = 'source-over';
      if (exposure < 0) {
        ctx.fillStyle = `rgba(0,0,0,${-exposure * 0.12})`;
        ctx.fillRect(PH.x, PH.y, PH.w, PH.h);
      }
    }
    ctx.fillStyle = vig;
    ctx.fillRect(PH.x, PH.y, PH.w, PH.h);

    // spot-healing brush: target circle, dashed source circle and a click ripple
    const bx = PH.x + PH.w * (0.58 + 0.12 * Math.sin(t * 0.27));
    const by = PH.y + PH.h * (0.56 + 0.1 * Math.sin(t * 0.36 + 1.3));
    const br = 17 + 2 * Math.sin(t * 0.8);
    const sx = bx - 84;
    const sy = by - 38;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, TWO_PI);
    ctx.stroke();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = '#f2f2f2';
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, TWO_PI);
    ctx.stroke();
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.arc(sx, sy, br, 0, TWO_PI);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(242,242,242,0.7)';
    ctx.beginPath();
    ctx.moveTo(sx + br * 0.9, sy + br * 0.4);
    ctx.lineTo(bx - br * 0.9, by - br * 0.4);
    ctx.stroke();
    const rp = (t % 6.5) / 6.5;
    if (rp < 0.2) {
      ctx.strokeStyle = `rgba(74,163,255,${1 - rp / 0.2})`;
      ctx.beginPath();
      ctx.arc(bx, by, br + rp * 90, 0, TWO_PI);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx, by + 15);
    ctx.lineTo(bx + 4, by + 11.5);
    ctx.lineTo(bx + 7, by + 18);
    ctx.lineTo(bx + 10, by + 16.5);
    ctx.lineTo(bx + 7, by + 10.5);
    ctx.lineTo(bx + 12, by + 10.5);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();

    // export progress
    ctx.fillStyle = '#111';
    ctx.fillRect(PROG.x, PROG.y, PROG.w, PROG.h);
    ctx.fillStyle = COL.accent;
    ctx.fillRect(PROG.x, PROG.y, PROG.w * ((t * 0.05) % 1), PROG.h);
  };

  // first frame (placeholder portrait) so the screen is never blank, then the real one when the image is in
  placeholder(px, PW, PHH);
  synthHist();
  drawChrome();
  render(2.5);
  tex.needsUpdate = true;
  withPortrait(loadFrom);
  onLivingQuality((q) => {
    animated = q === 'high';
  });

  const wp = new THREE.Vector3();
  const cp = new THREE.Vector3();

  return {
    texture: tex,
    attach(mesh: THREE.Mesh) {
      mesh.onBeforeRender = (_r, _s, camera) => {
        if (!animated && drawn) {
          return;
        }
        const now = clockWired ? clockT : performance.now() * 0.001 - t0;
        if (drawn && Math.abs(now - lastDraw) < 0.125) {
          return;
        }
        wp.setFromMatrixPosition(mesh.matrixWorld);
        cp.setFromMatrixPosition(camera.matrixWorld);
        if (wp.distanceToSquared(cp) > NEAR2) {
          return;
        }
        lastDraw = now;
        render(animated ? now : 2.5);
        tex.needsUpdate = true;
      };
    },
  };
}
