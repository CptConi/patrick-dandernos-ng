import * as THREE from 'three';
import type {
  BuildRoomOptions,
  Hotspot,
  PhotoCategory,
  StationId,
  StationPose,
  StudioRoom,
  Vec3,
} from './studio.types';
import { Kit } from './room/kit';
import { buildGallery, WALL_L } from './room/frames';
import { buildShell, ROOM, ROOM_EXT } from './room/shell';
import { CONTACT_Z } from './room/shell-contact';
import { buildArtistMannequin } from './room/props-artist-mannequin';
import {
  buildAcoustic,
  buildCabinet,
  buildChair,
  buildChest,
  buildClock,
  buildDesk,
  buildLamp,
  buildLesPaul,
  buildPlant,
  buildPorthole,
  buildSofa,
  buildStool,
  setLivingQuality,
} from './room/props-living';
import { buildLightingSet, MANNEQUIN_POS, OCTA_AT, STRIP_B_AT } from './room/props-set';
import { buildAtmosphere, SHAFT_WINDOWS } from './room/lighting-atmosphere';
import { buildGardenExterior } from './room/garden-exterior';
import { installSoftShadows } from './engine/shadow-filter';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib';
import {
  makeBackdropTexture,
  makeBlobTexture,
  makeClockTexture,
  makeDiffuserTexture,
  makeFloorTextures,
  makeGlassGlareTexture,
  makeGlowTexture,
  makePlasterTexture,
  makeRampTexture,
  makeScreenTexture,
} from './procedural-textures';

/**
 * Procedural reconstruction of Patrick d'Andernos' photo studio.
 *
 * World units are meters, Y is up. The room is 5.5 m wide (x in [-2.75, 2.75]) and 12.5 m long
 * (z in [-4.5, 8.0]: the 9 m original plus ROOM_EXT at the entrance end). Visitors come in at +Z and look toward -Z:
 *   - LEFT wall (x = -2.75): two photo universes (graphistes, macros), Les Paul, plant; the workstation (desk against
 *     the wall, monitor, chair, drum stool) in the far corner with the wooden chest (two red cushions) and the acoustic
 *     guitar on its stand in front of it
 *   - far end (z = -4.5): industrial bay window (~80% of the wall, kneewall + black steel grid)
 *   - entrance end (z = +8): the lighting set (two backdrops, softboxes, beauty dish, mannequin on a stool) at the
 *     opposite end from the window, behind the overview camera; the mannequin faces the window. Plaster wall with
 *     clock, hatch, porthole and heater behind it
 *   - RIGHT wall (x = +2.75): the portraits photo universe above the grey sofa and the black cabinet, wall telephone,
 *     entrance door
 */

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Desk centre: long side against the left wall, in the back-left corner beside the bay window. */
const DESK = { x: -2.38, z: -3.55 };
/** Office chair (pulled out from the desk, turned towards the room) and drum stool. */
const CHAIR = { x: -1.62, z: -3.25 };
const STOOL = { x: -1.1, z: -2.35 };
/** Wooden chest (two red cushions) against the left wall in front of the desk, guitar stand at its entrance-side end. */
const CHEST = { x: -2.48, z: -2.1 };
const ACOUSTIC = { x: -2.0, z: -1.42 };
/** Right wall furniture: sofa (2.3 m long) near the bay window, cabinet beside it towards the door and the phone. */
const SOFA = { x: 2.32, z: -3.1 };
const CABINET = { x: 2.515, z: -1.45 };

/**
 * The lighting set is authored against a wall with the figure facing +Z. It is turned by PI and parked at the entrance
 * end, so world = (SET_X - x, -z) and the mannequin faces the bay window (and the camera that photographs her).
 */
const SET_X = 1.55;
const setPos = (x: number, z: number): [number, number] => [SET_X - x, ROOM_EXT - z];
/** Mannequin (world). */
const MP = { x: SET_X - MANNEQUIN_POS.x, z: ROOM_EXT - MANNEQUIN_POS.z };
/** Pendant bulb lamp, hung behind the mannequin on the right (the roof slopes down away from the ridge). */
const LAMP = { x: 1.05, z: MP.z + 0.45 };
const roofY = (x: number) => ROOM.wallH + (ROOM.ridgeH - ROOM.wallH) * (1 - Math.min(1, Math.abs(x) / ROOM.halfW));

interface HlEntry {
  value: number;
  pos: THREE.Vector3;
  strength: number;
}

export function buildStudioRoom(opts: BuildRoomOptions): StudioRoom {
  const renderer = opts.renderer;
  let quality: 'high' | 'low' = opts.quality;
  const aniso = renderer.capabilities.getMaxAnisotropy();
  // Light intensities below are tuned for legacy (non physical) lights; compensate if the engine switched.
  const physical = (renderer as unknown as { useLegacyLights?: boolean }).useLegacyLights === false;
  const gDir = physical ? Math.PI : 1;
  const gPt = physical ? 9 * Math.PI : 1;
  const decay = physical ? 2 : 1;

  renderer.shadowMap.enabled = quality === 'high';
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const kit = new Kit(aniso);
  const root = new THREE.Group();
  root.name = 'studioRoom';

  /* ------------------------------------------------------------ */
  /* Textures                                                      */
  /* ------------------------------------------------------------ */
  const floorTex = makeFloorTextures(aniso);
  kit.tex(floorTex.map);
  kit.tex(floorTex.detail);
  const plaster = kit.tex(makePlasterTexture(aniso));
  const glowTex = kit.tex(makeGlowTexture());
  const blobTex = kit.tex(makeBlobTexture());
  const rampTex = kit.tex(makeRampTexture());
  const glareTex = kit.tex(makeGlassGlareTexture());
  const screenTex = kit.tex(makeScreenTexture());
  const clockTex = kit.tex(makeClockTexture());

  /* ------------------------------------------------------------ */
  /* Shell                                                         */
  /* ------------------------------------------------------------ */
  const shell = buildShell(kit, {
    floor: floorTex.map,
    floorDetail: floorTex.detail,
    floorTile: floorTex.tile,
    plaster,
    ramp: rampTex,
    blob: blobTex,
    glow: glowTex,
    glare: glareTex,
  });
  root.add(shell.group);

  // the garden outside the bay window (behind the wall plane, unlit, own haze)
  const garden = buildGardenExterior({ quality, aniso, glow: glowTex });
  root.add(garden.group);

  /* ------------------------------------------------------------ */
  /* Gallery wall                                                  */
  /* ------------------------------------------------------------ */
  const gallery = buildGallery(kit, glowTex);
  root.add(gallery.group);

  /* ------------------------------------------------------------ */
  /* Furniture & instruments                                       */
  /* ------------------------------------------------------------ */
  setLivingQuality(quality);
  const props = new THREE.Group();
  props.name = 'props';
  root.add(props);

  // right wall, under the portraits universe: grey sofa near the bay window, black cabinet beside it towards the door
  const sofa = buildSofa(kit);
  sofa.position.set(SOFA.x, 0, SOFA.z);
  sofa.rotation.y = -Math.PI / 2;
  props.add(sofa);

  const cabinet = buildCabinet(kit, screenTex);
  cabinet.position.set(CABINET.x, 0, CABINET.z);
  cabinet.rotation.y = -Math.PI / 2;
  props.add(cabinet);

  const lesPaul = buildLesPaul(kit);
  lesPaul.position.set(-2.38, 0, 1.15);
  lesPaul.rotation.y = Math.PI / 2 - 0.1;
  props.add(lesPaul);

  const plant = buildPlant(kit);
  plant.position.set(-2.33, 0, 2.35);
  props.add(plant);

  const chest = buildChest(kit);
  chest.position.set(CHEST.x, 0, CHEST.z);
  chest.rotation.y = Math.PI / 2;
  props.add(chest);

  const acoustic = buildAcoustic(kit);
  acoustic.position.set(ACOUSTIC.x, 0, ACOUSTIC.z);
  acoustic.rotation.y = Math.PI / 2 - 0.3;
  props.add(acoustic);

  // workstation: desk along the left wall in the back-left corner (builder's local -Z = wall side, so +Z faces +X: the
  // monitor sits against the wall and its screen faces the room), chair pulled out and turned back towards the desk
  const desk = buildDesk(kit, screenTex);
  // the builder tells where its back edge is (local z): sit it right against the wall
  DESK.x = WALL_L - (desk.userData.wallZ !== undefined ? desk.userData.wallZ : -0.35) + 0.004;
  desk.position.set(DESK.x, 0, DESK.z);
  desk.rotation.y = Math.PI / 2;
  props.add(desk);

  // artist's lay figure on the back-right corner of the desk (desk-local frame), turned towards the room and the monitor
  const artist = buildArtistMannequin(kit, { height: 0.5 });
  artist.position.set(0.58, 0.76, -0.21);
  artist.rotation.y = -0.57;
  desk.add(artist);

  const chair = buildChair(kit);
  chair.position.set(CHAIR.x, 0, CHAIR.z);
  chair.rotation.y = -Math.PI / 2 + 0.55;
  props.add(chair);
  // the drum stool may travel with the chair builder: park it near the desk, on the open floor
  const stool = chair.getObjectByName('stool') || buildStool(kit);
  stool.removeFromParent();
  stool.position.set(STOOL.x, 0, STOOL.z);
  props.add(stool);

  const porthole = buildPorthole(kit);
  porthole.position.set(-2.1, 1.5, ROOM.zEnt - 0.01);
  porthole.rotation.y = Math.PI;
  props.add(porthole);

  const clock = buildClock(kit, clockTex);
  clock.group.position.set(-0.55, 3.1, ROOM.zEnt - 0.01);
  clock.group.rotation.y = Math.PI;
  props.add(clock.group);

  const lampPivot = new THREE.Group();
  lampPivot.name = 'lampPivot';
  lampPivot.position.set(LAMP.x, roofY(LAMP.x) - 0.02, LAMP.z);
  const lamp = buildLamp(kit, glowTex);
  lamp.group.position.y = -3.6;
  lampPivot.add(lamp.group);
  props.add(lampPivot);

  const lightingSet = buildLightingSet(kit, {
    grey: kit.tex(makeBackdropTexture('grey', aniso)),
    ochre: kit.tex(makeBackdropTexture('ochre', aniso)),
    diffuser: kit.tex(makeDiffuserTexture(false)),
    diffuserGrid: kit.tex(makeDiffuserTexture(true)),
    quality,
  });
  lightingSet.rotation.y = Math.PI;
  lightingSet.position.set(SET_X, 0, ROOM_EXT);
  root.add(lightingSet);

  // contact shadows under the big objects
  shell.addBlob(SOFA.x + 0.1, SOFA.z, 1.3, 2.3, 1, 0);
  shell.addBlob(CABINET.x - 0.05, CABINET.z, 1.0, 1.1, 1, 0);
  shell.addBlob(-2.3, 1.15, 0.9, 0.9);
  shell.addBlob(-2.33, 2.35, 0.8, 0.8);
  shell.addBlob(CHEST.x + 0.1, CHEST.z, 1.2, 1.5);
  shell.addBlob(ACOUSTIC.x + 0.05, ACOUSTIC.z, 0.8, 0.8);
  shell.addBlob(DESK.x + 0.05, DESK.z, 2.0, 1.3, 1, Math.PI / 2);
  shell.addBlob(CHAIR.x, CHAIR.z, 0.9, 0.9);
  shell.addBlob(STOOL.x, STOOL.z, 0.55, 0.55);
  // under the lighting set (mannequin, strips, octabox, boom stand, backdrops), in set-local coordinates
  const setBlob = (x: number, z: number, w: number, d: number) => {
    const p = setPos(x, z);
    shell.addBlob(p[0], p[1], w, d);
  };
  setBlob(0.95, -3.1, 1.3, 1.5);
  setBlob(-0.4, -3.0, 1.6, 2.0);
  setBlob(OCTA_AT.x, OCTA_AT.z, 1.5, 1.5);
  setBlob(STRIP_B_AT.x, STRIP_B_AT.z, 1.4, 1.4);
  setBlob(1.7, -3.85, 1.6, 1.6);
  setBlob(0.95, -4.15, 2.6, 0.9);

  /* ------------------------------------------------------------ */
  /* Lights (<= 7, one shadow caster)                              */
  /* ------------------------------------------------------------ */
  // Mood: the set sits at the entrance end, the bay window glows at the far end and its daylight rakes down the whole
  // length of the room onto her (front-left key, no falloff), a warm pendant lamp over the set and a gentle cool rim.
  const HEMI = 0.5 * gDir;
  const KEY = 1.5 * gPt;
  const BULB = 1.5 * gPt;
  const WINDOW_POINT = 0.7 * gPt;
  const WINDOW_RECT = 1.9;
  const SPOT = 3.4 * gPt;
  const HL = 2.0 * gPt;

  const hemi = new THREE.HemisphereLight(0xe6ecf5, 0x4a4038, HEMI);
  hemi.name = 'hemi';
  root.add(hemi);

  // Key: warm daylight spot standing in the bay window, front-left of the set; the only shadow caster.
  const key = new THREE.SpotLight(0xffe2c0, KEY, 0, 0.72, 0.95, decay);
  key.name = 'keyLight';
  key.position.set(-0.9, 2.2, -3.9);
  key.target.position.set(MP.x - 0.1, 0.7, MP.z);
  key.castShadow = quality === 'high';
  key.shadow.mapSize.set(3072, 3072);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 17;
  key.shadow.bias = -0.0003;
  key.shadow.normalBias = 0.03;
  // read by the contact-hardening filter (engine/shadow-filter.ts) as the apparent light size, in metres
  key.shadow.radius = 0.5;
  installSoftShadows({ near: key.shadow.camera.near, far: key.shadow.camera.far, halfAngle: key.angle });
  // the room is static: the map is rendered once, then again only when something that casts into it changes
  key.shadow.autoUpdate = false;
  key.shadow.needsUpdate = true;
  root.add(key, key.target);

  const bulbLight = new THREE.PointLight(0xffa85c, BULB, 6.5, decay);
  bulbLight.name = 'bulbLight';
  const BULB_X = lamp.lightLocal.x + lampPivot.position.x;
  const BULB_Y = lampPivot.position.y - 1.1;
  const BULB_Z = lampPivot.position.z;
  bulbLight.position.set(BULB_X, BULB_Y, BULB_Z);
  root.add(bulbLight);

  // Cool daylight through the far bay window: an area light (broad, soft, reflects as a window on glossy wood) in high
  // quality only.
  RectAreaLightUniformsLib.init();
  const windowRect = new THREE.RectAreaLight(0xc4d8ff, WINDOW_RECT, 4.3, 1.5);
  windowRect.name = 'windowRect';
  windowRect.position.set(0, 1.75, -4.62);
  windowRect.lookAt(0.3, 1.0, 3.0);
  root.add(windowRect);

  // Gentle rim on the mannequin from behind on her right, daylight tinted (also the only window fill in low quality).
  const windowLight = new THREE.PointLight(0xc4d8ff, WINDOW_POINT, 4.2, decay);
  windowLight.name = 'windowLight';
  windowLight.position.set(MP.x + 1.1, 2.2, MP.z + 0.35);
  root.add(windowLight);

  // Slideshow spot: warm, very soft penumbra.
  const focusSpot = new THREE.SpotLight(0xffe2bc, 0, 9, 0.5, 1, decay);
  focusSpot.name = 'focusSpot';
  focusSpot.castShadow = false;
  root.add(focusSpot, focusSpot.target);

  const hlLight = new THREE.PointLight(0xffc084, 0, 4.8, decay);
  hlLight.name = 'highlightLight';
  root.add(hlLight);

  // Washed-out ceiling: the shell lights it with a flat emissive term, keep only a hint.
  root.traverse((o) => {
    if (o.name.startsWith('roof')) {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
      if (m && m.isMeshStandardMaterial) {
        m.emissiveIntensity *= 0.55;
      }
    }
  });

  /* ------------------------------------------------------------ */
  /* Atmosphere: light shafts + dust motes                          */
  /* ------------------------------------------------------------ */
  const atmo = buildAtmosphere(SHAFT_WINDOWS);
  root.add(atmo.group);

  const DUST = 240;
  const dustPos = new Float32Array(DUST * 3);
  const dustCol = new Float32Array(DUST * 3);
  const dustSeed = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) {
    dustPos[i * 3] = -2.4 + Math.random() * 4.8;
    dustPos[i * 3 + 1] = 0.3 + Math.random() * 2.9;
    dustPos[i * 3 + 2] = -4.0 + Math.random() * (8.2 + ROOM_EXT);
    dustSeed[i * 3] = Math.random() * Math.PI * 2;
    dustSeed[i * 3 + 1] = 0.01 + Math.random() * 0.03;
    dustSeed[i * 3 + 2] = 0.2 + Math.random() * 0.5;
  }
  const dustGeo = new THREE.BufferGeometry();
  const dustAttr = new THREE.BufferAttribute(dustPos, 3);
  dustAttr.setUsage(THREE.DynamicDrawUsage);
  dustGeo.setAttribute('position', dustAttr);
  const dustColAttr = new THREE.BufferAttribute(dustCol, 3);
  dustColAttr.setUsage(THREE.DynamicDrawUsage);
  dustGeo.setAttribute('color', dustColAttr);
  const dustMat = new THREE.PointsMaterial({
    size: 0.045,
    map: glowTex,
    color: 0xffe0b0,
    vertexColors: true,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  kit.registerDim(dustMat);
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.name = 'dust';
  dust.frustumCulled = false;
  dust.visible = quality === 'high';
  root.add(dust);

  /* ------------------------------------------------------------ */
  /* Hotspots                                                      */
  /* ------------------------------------------------------------ */
  const hlEntries: HlEntry[] = [];
  let shadowDirty = false;

  const hitBox = (name: string, cx: number, cy: number, cz: number, w: number, h: number, d: number) => {
    const m = new THREE.Mesh(kit.box(1, 1, 1), new THREE.MeshBasicMaterial({ visible: false }));
    m.scale.set(w, h, d);
    m.position.set(cx, cy, cz);
    m.visible = false;
    m.name = name;
    root.add(m);
    return m;
  };

  const discMat = (): THREE.MeshBasicMaterial =>
    new THREE.MeshBasicMaterial({
      map: glowTex,
      color: 0xffb36b,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
  const discGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

  const extraHotspot = (
    id: StationId,
    anchor: Vec3,
    pick: THREE.Object3D[],
    discs: Array<[number, number, number, number]>,
    lightPos: Vec3
  ): Hotspot => {
    const entry: HlEntry = { value: 0, pos: new THREE.Vector3(lightPos[0], lightPos[1], lightPos[2]), strength: 1 };
    hlEntries.push(entry);
    const meshes = discs.map((d) => {
      const m = new THREE.Mesh(discGeo, discMat());
      m.position.set(d[0], 0.014, d[1]);
      m.scale.set(d[2], 1, d[3]);
      m.visible = false;
      m.renderOrder = 1;
      m.name = `hotspotGlow-${id}`;
      root.add(m);
      return m;
    });
    return {
      id,
      anchor,
      pick,
      setHighlight: (v: number) => {
        const a = clamp01(v);
        entry.value = a;
        for (const m of meshes) {
          (m.material as THREE.MeshBasicMaterial).opacity = a * 0.7;
          m.visible = a > 0.01;
        }
      },
    };
  };

  // Pick lists = the object's real meshes (what is drawn is always hoverable) + tight invisible volumes that add a few
  // cm of margin and fill the gaps. The engine lets any real surface win over a volume.
  // 'studio' = the lighting set at the entrance end (mannequin, backdrops, softboxes). Its merged meshes weigh ~160k
  // triangles, too heavy to raycast every frame: volumes only.
  // footprints in set-local coordinates (x, z) and height range: tight boxes around the heads / bodies of the gear
  // (the thin stands are left out so the volumes do not balloon when seen from above)
  const setVolume = (name: string, lx: number, lz: number, w: number, d: number, y0: number, y1: number) => {
    const p = setPos(lx, lz);
    return hitBox(`hit-studio-${name}`, p[0], (y0 + y1) / 2, p[1], w, y1 - y0, d);
  };
  const studioHotspot = extraHotspot(
    'studio',
    [-0.3, 1.8, MP.z - 1.5],
    [
      setVolume('mannequin', MANNEQUIN_POS.x, MANNEQUIN_POS.z, 0.9, 0.9, 0, 1.7),
      setVolume('dish', MANNEQUIN_POS.x, MANNEQUIN_POS.z - 0.05, 0.7, 0.7, 1.85, 2.4),
      setVolume('backdrop', 0.95, -3.95, 2.0, 1.0, 0, 2.45),
      setVolume('ochre', 2.64, -4.15, 1.3, 0.8, 0, 2.45),
      setVolume('strip-b', STRIP_B_AT.x - 0.25, STRIP_B_AT.z - 0.15, 0.9, 0.9, 0.85, 2.2),
      setVolume('strip-g', 0.1, -2.7, 0.9, 0.9, 0.85, 2.2),
      setVolume('octa', OCTA_AT.x - 0.35, OCTA_AT.z - 0.08, 1.0, 1.1, 1.2, 2.3),
      setVolume('spot', -0.3, -3.55, 0.6, 0.6, 2.1, 2.7),
    ],
    [[MP.x - 0.1, MP.z - 0.25, 4.4, 3.0]],
    [MP.x, 1.9, MP.z - 0.8]
  );
  // 'about' = the workstation corner: desk along the left wall, chair, stool and the glowing glass beside them
  const aboutHotspot = extraHotspot(
    'about',
    [DESK.x + 0.4, 1.8, DESK.z - 0.25],
    [
      desk,
      chair,
      stool,
      hitBox('hit-about-desk', WALL_L + 0.385, 0.78, DESK.z, 0.77, 1.56, 1.76),
      hitBox('hit-about-chair', CHAIR.x, 0.62, CHAIR.z, 0.84, 1.24, 0.84),
      hitBox('hit-about-stool', STOOL.x, 0.4, STOOL.z, 0.56, 0.8, 0.56),
      hitBox('hit-about-bay', -1.45, 1.6, -4.35, 1.7, 1.7, 0.3),
    ],
    [[DESK.x + 0.8, DESK.z + 0.2, 2.8, 3.0]],
    [DESK.x + 0.9, 1.7, DESK.z + 0.3]
  );
  // 'contact' = wall telephone + shelf corner on the right wall (plus the entrance door)
  const contactParts: THREE.Object3D[] = [];
  for (const n of ['contactCorner', 'door']) {
    const part = shell.group.getObjectByName(n);
    if (part) {
      contactParts.push(part);
    }
  }
  const contactHotspot = extraHotspot(
    'contact',
    [2.3, 0.95, CONTACT_Z + 0.3],
    [
      ...contactParts,
      // wall dressing (phone, shelf, pin-board, hook rail, lights) and the floor props, volumes in front of the meshes
      hitBox('hit-contact-wall', 2.55, 1.6, CONTACT_Z + 0.37, 0.4, 1.7, 1.95),
      hitBox('hit-contact-floor', 2.5, 0.45, CONTACT_Z + 0.05, 0.5, 0.9, 1.6),
      hitBox('hit-contact-door', 2.6, 1.1, 1.95, 0.3, 2.25, 1.15),
    ],
    [[2.05, CONTACT_Z + 0.35, 1.4, 2.6]],
    [2.0, 1.7, CONTACT_Z + 0.2]
  );

  // labels sit under each hero's name plate; the overview view is high above the room, tune per frame if they crowd
  const nudge = (cat: PhotoCategory, y: number, dz = 0) => {
    const a = gallery.heroes[cat].anchor;
    gallery.heroes[cat].anchor = [a[0], y, a[2] + dz];
  };
  nudge('portraits', 1.035);
  nudge('macros', 1.035);
  // the HTML title block sits at the bottom left of the overview: this label rides above its frame instead
  nudge('graphistes', 2.5);

  // hero frames also nudge the shared highlight light
  const heroEntries = {} as Record<PhotoCategory, HlEntry>;
  (['portraits', 'macros', 'graphistes'] as PhotoCategory[]).forEach((cat) => {
    const hero = gallery.heroes[cat];
    const entry: HlEntry = {
      value: 0,
      pos: new THREE.Vector3(hero.center[0] + hero.normal[0] * 0.9, hero.center[1] + 0.25, hero.center[2]),
      strength: 0.5,
    };
    heroEntries[cat] = entry;
    hlEntries.push(entry);
    const original = hero.setHighlight;
    hero.setHighlight = (v: number) => {
      entry.value = clamp01(v);
      original(v);
    };
    // a hero frame resizing with its photo changes what casts into the (otherwise static) shadow map
    const resize = hero.setPhotoAspect;
    hero.setPhotoAspect = (a: number) => {
      resize(a);
      shadowDirty = true;
    };
  });

  /* ------------------------------------------------------------ */
  /* Station poses                                                 */
  /* ------------------------------------------------------------ */
  /**
   * Aim straight at `subject`. The engine already shifts the view away from the HTML panel (setViewInset), so no
   * extra sideways pre-aim here (it used to double the compensation and crop the subject at the left edge).
   */
  const pose = (position: Vec3, subject: Vec3, fov: number): StationPose => ({
    position,
    target: [subject[0], subject[1], subject[2]],
    fov,
  });
  // photo universe views: square-on, a little towards the entrance
  const wallPose = (cat: PhotoCategory): StationPose => {
    const h = gallery.heroes[cat];
    return pose([h.center[0] + h.normal[0] * 2.85, 1.62, Math.min(h.center[2] + 1.25, 1.0)], [h.center[0], 1.72, h.center[2]], 40);
  };

  const stations: Record<StationId, StationPose> = {
    // near the entrance end (the lighting set stands behind the camera), looking down the room: the three photo
    // universes on the walls, the glowing bay window and the workstation corner in one frame
    overview: { position: [-0.2, 3.0, 4.15], target: [-0.45, 1.0, -3.5], fov: 54 },
    portraits: wallPose('portraits'),
    macros: wallPose('macros'),
    graphistes: wallPose('graphistes'),
    // well down the room, looking back at the subject: mannequin, backdrops and softboxes
    studio: pose([0.3, 1.5, MP.z - 4.9], [MP.x - 0.25, 1.2, MP.z - 0.1], 45),
    // over the shoulder of the workstation chair: glowing monitor, the garden window beyond (engine adds a slow drift)
    about: pose([-0.2, 1.8, -2.1], [-2.3, 1.0, -3.75], 54),
    contact: pose([-0.5, 1.48, -2.2], [2.72, 1.12, CONTACT_Z + 0.3], 36),
  };

  /* ------------------------------------------------------------ */
  /* Dynamic state                                                 */
  /* ------------------------------------------------------------ */
  let focusAmt = 0;
  let focusCat: PhotoCategory = 'portraits';
  let lastT = 0;
  const tzOffsetSec = new Date().getTimezoneOffset() * 60;
  const windowEntries = kit.dimmables.filter((e) => shell.windowMats.some((m) => m.color === e.color));
  const otherEntries = kit.dimmables.filter((e) => windowEntries.indexOf(e) < 0);

  const placeSpot = (cat: PhotoCategory) => {
    const h = gallery.heroes[cat];
    focusSpot.position.set(h.center[0] + h.normal[0] * 2.5, h.center[1] + 1.0, h.center[2] + 0.35);
    focusSpot.target.position.set(h.center[0], h.center[1] - 0.05, h.center[2]);
    focusSpot.target.updateMatrixWorld();
    atmo.setHighlightCone(focusSpot.position, focusSpot.target.position, 0.85);
  };
  placeSpot(focusCat);

  const applyLights = (t: number) => {
    const f = focusAmt;
    const dim = 1 - 0.86 * f;
    const glowDim = 1 - 0.82 * f;
    const flick = 1 + 0.03 * Math.sin(t * 13.1) * Math.sin(t * 7.3) + 0.02 * Math.sin(t * 2.1) - (Math.sin(t * 0.41) > 0.996 ? 0.12 : 0);
    const pulse = 1 + 0.035 * Math.sin(t * 0.55) + 0.015 * Math.sin(t * 1.7 + 1);

    // room dims to ~12% in the slideshow; the window keeps a little more so it stays a believable bright opening
    hemi.intensity = HEMI * dim;
    key.intensity = KEY * dim;
    bulbLight.intensity = BULB * dim * flick;
    windowLight.intensity = WINDOW_POINT * (quality === 'high' ? 1 : 1.35) * dim * pulse;
    windowRect.intensity = WINDOW_RECT * dim * pulse;
    focusSpot.intensity = SPOT * f;

    for (const e of otherEntries) {
      e.color.copy(e.base).multiplyScalar(glowDim);
    }
    for (const e of windowEntries) {
      e.color.copy(e.base).multiplyScalar((1 - 0.7 * f) * pulse);
    }
    garden.setBrightness((1 - 0.7 * f) * pulse);

    // shared hover light follows the strongest highlighted hotspot
    let best: HlEntry | null = null;
    let bestV = 0.001;
    for (const e of hlEntries) {
      const v = e.value * e.strength;
      if (v > bestV) {
        bestV = v;
        best = e;
      }
    }
    if (best) {
      hlLight.position.copy(best.pos);
    }
    hlLight.intensity = best ? HL * bestV * (1 - 0.6 * f) : 0;
  };
  applyLights(0);

  /* ------------------------------------------------------------ */
  /* Public API                                                    */
  /* ------------------------------------------------------------ */
  const update = (t: number, dt: number) => {
    lastT = t;
    if (shadowDirty) {
      shadowDirty = false;
      key.shadow.needsUpdate = true;
    }

    // lamp sway + light following the bulbs
    const rz = 0.012 * Math.sin(t * 0.62) + 0.004 * Math.sin(t * 1.3);
    const rx = 0.009 * Math.sin(t * 0.47 + 1.1);
    lampPivot.rotation.z = rz;
    lampPivot.rotation.x = rx;
    bulbLight.position.set(BULB_X + 1.1 * Math.sin(rz), BULB_Y, BULB_Z - 1.1 * Math.sin(rx));

    // wall clock
    const secs = (Date.now() / 1000 - tzOffsetSec) % 86400;
    clock.minute.rotation.z = -((secs % 3600) / 3600) * Math.PI * 2;
    clock.hour.rotation.z = -((secs % 43200) / 43200) * Math.PI * 2;

    // dust motes drift slowly upward and wobble; the ones crossing a light shaft catch the light
    if (dust.visible) {
      const step = Math.min(dt, 0.05);
      for (let i = 0; i < DUST; i++) {
        const o = i * 3;
        dustPos[o + 1] += dustSeed[o + 1] * step * 3;
        dustPos[o] += Math.sin(t * dustSeed[o + 2] + dustSeed[o]) * 0.0016;
        dustPos[o + 2] += Math.cos(t * dustSeed[o + 2] * 0.8 + dustSeed[o]) * 0.0014;
        if (dustPos[o + 1] > 3.3) {
          dustPos[o + 1] = 0.25;
        }
        const b = 0.3 + 1.1 * atmo.shaftAmount(dustPos[o], dustPos[o + 1], dustPos[o + 2]);
        dustCol[o] = b;
        dustCol[o + 1] = b * 0.96;
        dustCol[o + 2] = b * 0.88;
      }
      dustAttr.needsUpdate = true;
      dustColAttr.needsUpdate = true;
      dustMat.opacity = (0.5 + 0.1 * Math.sin(t * 0.7)) * (1 - focusAmt);
    }
    atmo.update(t, focusAmt);
    garden.update(t, dt);

    applyLights(t);
  };

  const setFocusMode = (amount: number, focus?: PhotoCategory) => {
    focusAmt = clamp01(amount);
    gallery.setFocus(focusAmt);
    // nothing floats in front of the slideshow photo
    dust.visible = quality === 'high' && focusAmt < 0.995;
    if (focus && focus !== focusCat) {
      focusCat = focus;
      placeSpot(focus);
    }
    applyLights(lastT);
  };

  const setQuality = (q: 'high' | 'low') => {
    quality = q;
    const hi = q === 'high';
    shell.setQuality?.(q);
    gallery.setQuality?.(q);
    garden.setQuality(q);
    setLivingQuality(q);
    key.castShadow = hi;
    key.shadow.needsUpdate = hi;
    renderer.shadowMap.enabled = hi;
    dust.visible = hi && focusAmt < 0.995;
    windowRect.visible = hi;
    windowLight.visible = true;
    atmo.group.visible = true;
  };
  setQuality(quality);

  const dispose = () => {
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) {
        mesh.geometry.dispose();
      }
      const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (m) {
        for (const mat of Array.isArray(m) ? m : [m]) {
          for (const key2 of Object.keys(mat)) {
            const v = (mat as unknown as Record<string, unknown>)[key2];
            if (v && (v as THREE.Texture).isTexture) {
              (v as THREE.Texture).dispose();
            }
          }
          mat.dispose();
        }
      }
      if ((o as THREE.InstancedMesh).isInstancedMesh) {
        (o as THREE.InstancedMesh).dispose();
      }
    });
    for (const t of kit.textures) {
      t.dispose();
    }
    atmo.dispose();
    garden.dispose();
    key.shadow.dispose();
    if (key.shadow.map) {
      key.shadow.map.dispose();
    }
    root.removeFromParent();
  };

  return {
    root,
    heroFrames: gallery.heroes,
    decorFrames: gallery.decor,
    extraHotspots: [studioHotspot, aboutHotspot, contactHotspot],
    stations,
    update,
    setFocusMode,
    setQuality,
    dispose,
  };
}
