import * as THREE from 'three';
import { Kit, put } from './kit';
import { rng } from '../procedural-textures';
import { Bag, canvasTex, contactBlob, makeCanvas, onLivingQuality, taperedTube, lstd, lin } from './living-util';

/** One leaf (unit length along +Y, width along X): folded around the midrib, curled and drooping. */
function leafGeometry(): THREE.BufferGeometry {
  const L = 8;
  const pos: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= L; i++) {
    const t = i / L;
    const hw = 0.36 * Math.sin(Math.PI * Math.pow(t, 0.7)) * (1 - 0.28 * t) + 0.004;
    for (let j = -1; j <= 1; j++) {
      const x = j * hw;
      const fold = Math.abs(j) * hw * 0.38;
      const droop = -0.28 * t * t + 0.05 * Math.sin(t * 3);
      const wave = Math.abs(j) * 0.012 * Math.sin(t * 14);
      pos.push(x, t, fold + droop + wave);
      const shade = j === 0 ? 1 : 0.74 + 0.1 * (1 - Math.abs(j));
      const b = shade * (0.8 + 0.2 * t);
      col.push(b, b, b);
      uv.push((j + 1) / 2, t);
    }
  }
  for (let i = 0; i < L; i++) {
    for (let j = 0; j < 2; j++) {
      const a = i * 3 + j;
      const b = a + 1;
      const c = a + 3;
      const d = c + 1;
      idx.push(a, b, d, a, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function leafTexture(k: Kit): THREE.CanvasTexture {
  const W = 64;
  const H = 128;
  const [c, ctx] = makeCanvas(W, H);
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, '#8db868');
  g.addColorStop(0.5, '#c4e09a');
  g.addColorStop(1, '#8db868');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(235,245,170,0.85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(W / 2, H);
  ctx.lineTo(W / 2, 0);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(214,236,150,0.55)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 22; i++) {
    const y = H - 8 - i * 5.4;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(W / 2, y);
      ctx.lineTo(W / 2 + s * 26, y - 14);
      ctx.stroke();
    }
  }
  return canvasTex(k, c, { srgb: true, repeat: false });
}

/** Ficus benjamina in a black pot: tapered woody stems and ~370 instanced two-tone leaves that sway. */
export function buildPlantRich(k: Kit): THREE.Group {
  const g = new THREE.Group();
  g.name = 'plant';
  const rand = rng(404);

  const potMat = new THREE.MeshPhysicalMaterial({
    color: lin(0x111113),
    roughness: 0.38,
    metalness: 0.05,
    clearcoat: 0.35,
    clearcoatRoughness: 0.4,
    side: THREE.DoubleSide,
  });
  const soilMat = lstd(k, 0x2a1d14, 1);
  const bark = new THREE.MeshStandardMaterial({ color: lin(0x77604b), roughness: 0.88 });

  const prof: Array<[number, number]> = [
    [0.001, 0], [0.115, 0], [0.13, 0.008], [0.138, 0.03], [0.16, 0.18], [0.19, 0.34], [0.208, 0.396],
    [0.222, 0.41], [0.224, 0.422], [0.212, 0.431], [0.198, 0.426], [0.193, 0.412], [0.19, 0.39], [0.001, 0.372],
  ];
  const pot = k.geo('pot-rich', () => new THREE.LatheGeometry(prof.map((p) => new THREE.Vector2(p[0], p[1])), 40));
  put(g, pot, potMat, 0, 0, 0, { cast: true });

  // lumpy soil with a few bark chips
  const soilGeo = k.geo('soil-rich', () => {
    const s = new THREE.CircleGeometry(0.194, 26, 0, Math.PI * 2).rotateX(-Math.PI / 2);
    const p = s.attributes.position as THREE.BufferAttribute;
    const r2 = rng(5);
    for (let i = 0; i < p.count; i++) {
      p.setY(i, (r2() - 0.5) * 0.014);
    }
    s.computeVertexNormals();
    return s;
  });
  put(g, soilGeo, soilMat, 0, 0.388, 0);
  const chips = new Bag();
  const chipMat = lstd(k, 0x5a4030, 0.9);
  for (let i = 0; i < 14; i++) {
    const a = rand() * 6.28;
    const r = 0.04 + rand() * 0.14;
    chips.add(chipMat, k.box(0.03, 0.01, 0.014), Math.cos(a) * r, 0.394, Math.sin(a) * r, { ry: rand() * 3, rz: (rand() - 0.5) * 0.4 });
  }
  chips.flush(g);

  // trunks: three twisting stems
  const trunks = new THREE.Group();
  g.add(trunks);
  const barkGeos: THREE.BufferGeometry[] = [];
  const trunkCurves: THREE.CatmullRomCurve3[] = [];
  for (let s = 0; s < 3; s++) {
    const a0 = (s / 3) * Math.PI * 2 + 0.4;
    const pts: THREE.Vector3[] = [];
    const H = [0.38, 0.6, 0.82, 1.0, 1.12];
    H.forEach((h, i) => {
      const a = a0 + i * 0.55;
      const rad = 0.012 + i * 0.012 + (s === 1 ? 0.008 : 0);
      pts.push(new THREE.Vector3(Math.cos(a) * rad, h + (s - 1) * 0.04, Math.sin(a) * rad));
    });
    const curve = new THREE.CatmullRomCurve3(pts);
    barkGeos.push(taperedTube(curve, 0.027 - s * 0.003, 0.012, 16, 7));
    trunkCurves.push(curve);
  }

  // primary branches fanning into an ellipsoid crown
  const centre = new THREE.Vector3(0, 1.0, 0);
  const radii = new THREE.Vector3(0.56, 0.62, 0.56);
  interface Branch {
    curve: THREE.CatmullRomCurve3;
  }
  const branches: Branch[] = [];
  const NB = 24;
  for (let b = 0; b < NB; b++) {
    const u = (b / NB) * Math.PI * 2 + rand() * 0.6;
    const v = Math.acos(1 - rand() * 1.85); // covers the upper hemisphere and a bit below
    const rf = 0.65 + rand() * 0.35;
    const end = new THREE.Vector3(
      Math.sin(v) * Math.cos(u) * radii.x * rf,
      Math.cos(v) * radii.y * rf + centre.y,
      Math.sin(v) * Math.sin(u) * radii.z * rf
    );
    const start = trunkCurves[b % 3].getPoint(0.35 + rand() * 0.65);
    const mid = start.clone().lerp(end, 0.5);
    mid.y += 0.08 + rand() * 0.1;
    mid.x += (rand() - 0.5) * 0.1;
    mid.z += (rand() - 0.5) * 0.1;
    const curve = new THREE.CatmullRomCurve3([start, mid, end]);
    branches.push({ curve });
    barkGeos.push(taperedTube(curve, 0.012 + rand() * 0.004, 0.0028, 10, 5));
  }
  const barkBag = new Bag();
  for (const bg of barkGeos) {
    barkBag.push(bark, bg, new THREE.Matrix4(), {
      ao: (p) => 0.7 + 0.3 * Math.min(1, Math.max(0, (p.y - 0.4) / 0.6)),
    });
  }
  barkBag.flush(g, { cast: true });

  // leaves ---------------------------------------------------------
  const leafGeo = k.geo('ficus-leaf', leafGeometry);
  const uTime = { value: 0 };
  const uAmp = { value: 1 };
  const leafMat = new THREE.MeshStandardMaterial({
    color: lin(0xffffff),
    roughness: 0.42,
    metalness: 0,
    side: THREE.DoubleSide,
    map: leafTexture(k),
    vertexColors: true,
  });
  leafMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.uniforms.uAmp = uAmp;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uAmp;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = instanceMatrix[3].xyz;
          float amp = smoothstep(0.5, 1.7, ip.y) * 0.0065 * uAmp;
          float ph = uTime * 1.5 + ip.x * 7.0 + ip.z * 5.0 + ip.y * 3.0;
          vec3 sw = vec3(sin(ph), 0.3 * sin(ph * 1.7 + 1.3), cos(ph * 0.9)) * amp;
          mvPosition.xyz += (modelViewMatrix * vec4(sw, 0.0)).xyz;
          gl_Position = projectionMatrix * mvPosition;
        #endif`
      );
  };
  leafMat.customProgramCacheKey = () => 'ficus-sway';

  interface LeafSpec {
    p: THREE.Vector3;
    d: THREE.Vector3;
    s: number;
  }
  const specs: LeafSpec[] = [];
  const tan = new THREE.Vector3();
  const rad = new THREE.Vector3();
  const per = 28;
  for (const br of branches) {
    for (let i = 0; i < per; i++) {
      const t = 0.18 + (i / per) * 0.82 + (rand() - 0.5) * 0.04;
      const p = br.curve.getPoint(Math.min(1, t));
      br.curve.getTangent(Math.min(1, t), tan);
      rad.set(p.x, p.y - 0.8, p.z).normalize();
      const d = new THREE.Vector3(
        tan.x * 0.4 + rad.x * 0.55 + (rand() - 0.5) * 0.9,
        tan.y * 0.4 + rad.y * 0.45 - 0.3 + (rand() - 0.5) * 0.7,
        tan.z * 0.4 + rad.z * 0.55 + (rand() - 0.5) * 0.9
      ).normalize();
      p.add(new THREE.Vector3((rand() - 0.5) * 0.03, (rand() - 0.5) * 0.03, (rand() - 0.5) * 0.03));
      specs.push({ p, d, s: 0.105 + rand() * 0.075 });
    }
  }
  // shuffle so that reducing `count` thins the crown evenly
  for (let i = specs.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = specs[i];
    specs[i] = specs[j];
    specs[j] = tmp;
  }
  const inst = new THREE.InstancedMesh(leafGeo, leafMat, specs.length);
  inst.name = 'plantLeaves';
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  const qa = new THREE.Quaternion();
  const qb = new THREE.Quaternion();
  const Yax = new THREE.Vector3(0, 1, 0);
  specs.forEach((sp, i) => {
    qa.setFromUnitVectors(Yax, sp.d);
    qb.setFromAxisAngle(Yax, rand() * Math.PI * 2);
    dummy.quaternion.copy(qa).multiply(qb);
    dummy.position.copy(sp.p);
    dummy.scale.setScalar(sp.s);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
    col.setHSL(0.27 + rand() * 0.07, 0.5 + rand() * 0.25, 0.22 + rand() * 0.2);
    inst.setColorAt(i, col);
  });
  inst.castShadow = true;
  inst.receiveShadow = true;
  inst.frustumCulled = false;
  inst.onBeforeRender = () => {
    uTime.value = performance.now() * 0.001;
  };
  g.add(inst);
  onLivingQuality((q) => {
    inst.count = q === 'high' ? specs.length : Math.floor(specs.length * 0.55);
    uAmp.value = q === 'high' ? 1 : 0;
  });

  contactBlob(k, g, 0, 0, 0.62, 0.62, 0.7);
  contactBlob(k, g, 0, 0, 1.1, 1.1, 0.35);
  return g;
}
