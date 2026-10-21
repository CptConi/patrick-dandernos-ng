import * as THREE from 'three';

function cv(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d') as CanvasRenderingContext2D];
}

/** Fine lengthwise wood grain used as a bump map on the satin-black mouldings (u runs along the bar). */
export function makeMouldBump(): THREE.CanvasTexture {
  const [c, ctx] = cv(256, 256);
  const img = ctx.createImageData(256, 256);
  const d = img.data;
  for (let y = 0; y < 256; y++) {
    const row = 128 + (Math.random() - 0.5) * 64 + Math.sin(y * 0.37) * 10;
    for (let x = 0; x < 256; x++) {
      const v = Math.max(0, Math.min(255, row + (Math.random() - 0.5) * 22));
      const i = (y * 256 + x) * 4;
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Faint diagonal glare bands, added on top of the photo through the glass (emissive map, additive). */
export function makeGlassStreak(): THREE.CanvasTexture {
  const [c, ctx] = cv(128, 128);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 128, 128);
  ctx.translate(64, 64);
  ctx.rotate(-0.62);
  const g = ctx.createLinearGradient(-90, 0, 90, 0);
  const st = (p: number, a: number) => g.addColorStop(p, `rgba(255,255,255,${a})`);
  st(0, 0);
  st(0.2, 0);
  st(0.3, 0.2);
  st(0.4, 0);
  st(0.52, 0);
  st(0.56, 0.1);
  st(0.6, 0);
  st(1, 0);
  ctx.fillStyle = g;
  ctx.fillRect(-128, -128, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  return t;
}

/** Brushed brass plate with an engraved serif caption. */
export function makePlaqueTexture(text: string): THREE.CanvasTexture {
  const W = 512;
  const H = 96;
  const [c, ctx] = cv(W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#d2ad70');
  g.addColorStop(0.5, '#b08a50');
  g.addColorStop(1, '#8e6c3a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,240,205,0.07)' : 'rgba(50,30,8,0.07)';
    ctx.fillRect(0, Math.random() * H, W, 1);
  }
  ctx.strokeStyle = 'rgba(60,40,14,0.55)';
  ctx.lineWidth = 2;
  ctx.strokeRect(8, 8, W - 16, H - 16);
  ctx.strokeStyle = 'rgba(255,238,200,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(10, 10, W - 20, H - 20);

  const font = '600 40px "Cormorant Garamond", "Playfair Display", Georgia, "Times New Roman", serif';
  ctx.font = font;
  ctx.textBaseline = 'middle';
  const spacing = 9;
  let total = -spacing;
  for (const ch of text) {
    total += ctx.measureText(ch).width + spacing;
  }
  const draw = (dx: number, color: string) => {
    ctx.fillStyle = color;
    let x = (W - total) / 2 + dx;
    for (const ch of text) {
      ctx.fillText(ch, x, H / 2 + 2 + dx);
      x += ctx.measureText(ch).width + spacing;
    }
  };
  draw(1.4, 'rgba(255,238,200,0.6)');
  draw(0, '#33220c');
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  return t;
}

/** Black alpha texture: gentle darkening toward the ceiling line and the ends of the gallery wall. */
export function makeWallFalloff(): THREE.CanvasTexture {
  const [c, ctx] = cv(512, 256);
  const v = ctx.createLinearGradient(0, 0, 0, 256);
  v.addColorStop(0, 'rgba(8,6,4,0.22)');
  v.addColorStop(0.18, 'rgba(8,6,4,0.1)');
  v.addColorStop(0.4, 'rgba(8,6,4,0.0)');
  v.addColorStop(0.82, 'rgba(8,6,4,0.0)');
  v.addColorStop(1, 'rgba(8,6,4,0.07)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, 512, 256);
  ctx.globalCompositeOperation = 'destination-in';
  const h = ctx.createLinearGradient(0, 0, 512, 0);
  h.addColorStop(0, 'rgba(0,0,0,0)');
  h.addColorStop(0.14, 'rgba(0,0,0,1)');
  h.addColorStop(0.86, 'rgba(0,0,0,1)');
  h.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = h;
  ctx.fillRect(0, 0, 512, 256);
  return new THREE.CanvasTexture(c);
}

/** Vertical light falloff (bright at top, fading down) for the picture light wash. */
export function makeTopLight(): THREE.CanvasTexture {
  const [c, ctx] = cv(8, 128);
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.45)');
  g.addColorStop(0.75, 'rgba(255,255,255,0.05)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 128);
  return new THREE.CanvasTexture(c);
}
