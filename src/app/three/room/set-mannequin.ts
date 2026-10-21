import * as THREE from 'three';
import { Kit } from './kit';
import { Bake } from './set-geo';
import { makeDarkWood } from './set-tex';
import { skinArmGeo, skinTorsoGeo } from './mannequin-body';
import { ankleGeo, handGeos, handMatrix, shoeGeos, shoeMatrix } from './mannequin-limbs';
import { bandGeo, pelvisGeo, sleeveGeo, sweaterTorso, trouserLegGeo } from './mannequin-cloth';
import { headGeo, neckGeo, wigGeo } from './mannequin-head';
import { ARM, LEG, SEAT, headMatrix } from './mannequin-pose';
import { makeCopperHair, makeCrepe, makeKnitTile, makeMotifDecal, makeRibTile, makeShoeTex } from './mannequin-tex';

/**
 * Seated fashion mannequin (abstract ivory head, copper bob, cream knit sweater, black trousers and
 * stilettos) on a dark wooden bar stool. Local frame: origin on the floor under the stool, figure faces +Z.
 */

type Params = THREE.MeshPhysicalMaterialParameters;

export interface MannequinOpts {
  quality: 'high' | 'low';
  aniso: number;
}

export function buildMannequin(k: Kit, pos: THREE.Vector3, o: MannequinOpts): THREE.Group {
  const hi = o.quality === 'high';
  const g = new THREE.Group();
  g.name = 'mannequin';
  g.position.copy(pos);
  g.rotation.y = 0.12;

  // low quality: plain standard material, no clearcoat / sheen / normal map
  const pickStd = (p: Params): THREE.MeshStandardMaterialParameters => {
    const out: THREE.MeshStandardMaterialParameters = { vertexColors: true };
    for (const key of ['color', 'roughness', 'metalness', 'map', 'side'] as const) {
      if (p[key] !== undefined) {
        (out as Record<string, unknown>)[key] = p[key];
      }
    }
    return out;
  };
  const phys = (p: Params): THREE.MeshStandardMaterial =>
    hi ? new THREE.MeshPhysicalMaterial({ vertexColors: true, ...p }) : new THREE.MeshStandardMaterial(pickStd(p));

  const woodTex = k.tex(makeDarkWood());
  const hairTex = k.tex(makeCopperHair(o.aniso));
  const knit = makeKnitTile(o.aniso);
  const rib = makeRibTile(o.aniso);
  const motif = makeMotifDecal(o.aniso);
  [knit.map, knit.normal, rib.map, rib.normal, motif].forEach((t) => k.tex(t));
  const crepe = k.tex(makeCrepe(o.aniso));
  const shoeTex = k.tex(makeShoeTex(o.aniso));
  shoeTex.wrapS = THREE.ClampToEdgeWrapping;
  shoeTex.wrapT = THREE.ClampToEdgeWrapping;

  const cream = new THREE.Color(0xfff3e0);
  const M = {
    wood: phys({ color: 0xffffff, map: woodTex, roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.5 }),
    skin: phys({ color: 0xe0d4c2, roughness: 0.4, clearcoat: 0.35, clearcoatRoughness: 0.3, sheen: 0.4, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xf3d6c6) }),
    wig: phys({ color: 0xf2e2da, map: hairTex, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.18, sheen: 0.6, sheenRoughness: 0.4, sheenColor: new THREE.Color(0xff7a3a) }),
    knit: phys({ color: 0xffffff, map: knit.map, roughness: 0.95, sheen: 0.7, sheenRoughness: 0.85, sheenColor: cream, side: THREE.DoubleSide }),
    rib: phys({ color: 0xffffff, map: rib.map, roughness: 0.95, sheen: 0.7, sheenRoughness: 0.85, sheenColor: cream, side: THREE.DoubleSide }),
    wigIn: new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x2a0c06, roughness: 0.9 }),
    trim: new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xdfe3e8, roughness: 0.25, metalness: 0.85 }),
    shoe: phys({ color: 0xffffff, map: shoeTex, roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.4, metalness: 0.0 }),
    trouser: phys({ color: 0xffffff, map: crepe, roughness: 0.9, sheen: 0.15, sheenRoughness: 0.8, sheenColor: new THREE.Color(0x2a2a30), side: THREE.DoubleSide }),
  };
  if (hi) {
    (M.knit as THREE.MeshPhysicalMaterial).normalMap = knit.normal;
    (M.rib as THREE.MeshPhysicalMaterial).normalMap = rib.normal;
    (M.rib as THREE.MeshPhysicalMaterial).normalScale.set(0.7, 0.7);
  }
  const B = { wood: new Bake(), skin: new Bake(), wig: new Bake(), wigIn: new Bake(), knit: new Bake(), rib: new Bake(), trouser: new Bake(), shoe: new Bake(), trim: new Bake() };

  /* ----- wooden bar stool ----- */
  const legH = SEAT - 0.045;
  B.wood.geo(k.rbox(0.37, 0.045, 0.35, 0.016), 0xffffff, 0, SEAT - 0.0225, 0);
  B.wood.geo(k.rbox(0.31, 0.03, 0.29, 0.01), 0xb8aca0, 0, SEAT - 0.06, 0); // apron
  const legAt = (sx: number, sz: number, y: number): [number, number] => {
    const f = 1 - y / legH;
    return [sx * (0.145 + 0.045 * (1 - f)), sz * (0.135 + 0.045 * (1 - f))];
  };
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const [tx, tz] = legAt(sx, sz, legH);
      const [bx, bz] = legAt(sx, sz, 0);
      B.wood.rod(tx, legH, tz, bx, 0.0, bz, 0.021, 0.015, 0xf2ece4, 4);
    }
  }
  for (const sx of [-1, 1]) {
    const [x0, z0] = legAt(sx, -1, 0.3);
    const [x1, z1] = legAt(sx, 1, 0.3);
    B.wood.rod(x0, 0.3, z0, x1, 0.3, z1, 0.0105, 0.0105, 0xdcd2c6, 6);
  }
  for (const sz of [-1, 1]) {
    const [x0, z0] = legAt(-1, sz, 0.36);
    const [x1] = legAt(1, sz, 0.36);
    B.wood.rod(x0, 0.36, z0, x1, 0.36, z0, 0.0105, 0.0105, 0xdcd2c6, 6);
  }

  /* ----- head, neck, wig ----- */
  const hm = headMatrix();
  const add = (b: Bake, geo: THREE.BufferGeometry, m?: THREE.Matrix4) => {
    if (m) {
      b.mat4(geo, 0xffffff, m);
    } else {
      b.geo(geo, 0xffffff);
    }
    geo.dispose();
  };
  add(B.skin, headGeo(hi), hm);
  add(B.skin, neckGeo(hi));
  add(B.wig, wigGeo(hi), hm);
  const wigIn = wigGeo(hi, true);
  B.wigIn.mat4(wigIn, 0xffffff, hm);
  wigIn.dispose();
  add(B.skin, skinTorsoGeo(hi));

  /* ----- sweater ----- */
  const sw = sweaterTorso(hi);
  add(B.knit, sw.torso);
  add(B.rib, bandGeo(sw.hem, 0.0115, 42, 0.004, 1.5));
  add(B.rib, bandGeo(sw.rim, 0.0075, 25, 0, 1.6));
  const decalMat = new THREE.MeshStandardMaterial({ map: motif, transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const decal = new THREE.Mesh(sw.decal, decalMat);
  decal.name = 'mannequinMotifs';
  decal.receiveShadow = true;
  decal.renderOrder = 1;
  g.add(decal);

  for (const s of ['L', 'R'] as const) {
    const arm = ARM[s];
    add(B.skin, skinArmGeo(arm, hi));
    const sl = sleeveGeo(arm, hi);
    add(B.knit, sl.geo);
    add(B.rib, bandGeo(sl.cuff, 0.0095, 9, 0.002, 1.5));
    const hmx = handMatrix(arm);
    for (const hg of handGeos(arm, s === 'L' ? 1 : -1, hi)) {
      B.skin.mat4(hg, 0xffffff, hmx);
      hg.dispose();
    }
  }

  /* ----- trousers ----- */
  add(B.trouser, pelvisGeo(hi));
  add(B.trouser, trouserLegGeo(LEG.L, hi, 0.3));
  add(B.trouser, trouserLegGeo(LEG.R, hi, 1.7));

  /* ----- ankles and shoes ----- */
  for (const s of ['L', 'R'] as const) {
    const leg = LEG[s];
    add(B.skin, ankleGeo(leg, hi));
    const sm = s === 'L' ? shoeMatrix(leg, 0.12, 0) : shoeMatrix(leg, -0.15, 0.75);
    for (const sg of shoeGeos(hi)) {
      B.shoe.mat4(sg, 0xffffff, sm);
      sg.dispose();
    }
  }

  /* ----- fine chain with a tiny pendant ----- */
  const chain: THREE.Vector3[] = [];
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const aw = Math.atan2(Math.sin(a), Math.cos(a));
    chain.push(new THREE.Vector3(0.056 * Math.sin(a), 1.289 - 0.034 * Math.exp(-((aw / 0.6) ** 2)), -0.032 + 0.063 * Math.cos(a)));
  }
  B.trim.mat4(bandGeo(chain, 0.0013, 160, 0), 0xffffff, new THREE.Matrix4());
  B.trim.ball(0, 1.251, 0.034, 0.0048, 0xffffff);

  B.wood.flush(g, M.wood, { cast: true, name: 'stool' });
  B.skin.flush(g, M.skin, { cast: true, ao: false, name: 'mannequinSkin' });
  B.wig.flush(g, M.wig, { cast: true, ao: false, name: 'mannequinWig' });
  B.wigIn.flush(g, M.wigIn, { cast: false, ao: false, name: 'mannequinWigLining' });
  B.knit.flush(g, M.knit, { cast: true, ao: false, name: 'mannequinKnit' });
  B.rib.flush(g, M.rib, { cast: true, ao: false, name: 'mannequinRib' });
  B.trouser.flush(g, M.trouser, { cast: true, ao: false, name: 'mannequinTrousers' });
  B.trim.flush(g, M.trim, { cast: false, ao: false, name: 'mannequinChain' });
  B.shoe.flush(g, M.shoe, { cast: true, ao: false, name: 'mannequinShoes' });
  return g;
}
