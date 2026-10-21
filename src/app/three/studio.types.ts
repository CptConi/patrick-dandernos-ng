import type * as THREE from 'three';

/**
 * Shared contract between the three layers of the 3D studio experience:
 *   - studio-room.ts   (geometry, materials, lights, props)      -> builds a StudioRoom
 *   - studio-scene.ts  (renderer, camera rig, input, slideshow)  -> consumes a StudioRoom, exposes StudioSceneApi
 *   - pages/experience (Angular UI overlay)                      -> consumes StudioSceneApi
 *
 * three.js version is r150: use `renderer.outputEncoding = THREE.sRGBEncoding`,
 * `texture.encoding = THREE.sRGBEncoding` (NOT colorSpace).
 */

export type PhotoCategory = 'portraits' | 'macros' | 'graphistes';

export type StationId =
  | 'overview'
  | 'portraits'
  | 'macros'
  | 'graphistes'
  | 'studio'
  | 'about'
  | 'contact';

/** Order used by the arrow keys / prev-next arrows. */
export const STATION_ORDER: StationId[] = [
  'overview',
  'portraits',
  'macros',
  'graphistes',
  'studio',
  'about',
  'contact',
];

export type Vec3 = [number, number, number];

/** Photo as returned by the backend (`/files/gallery/:category`, `/files/landingpagepics`). */
export interface RemotePhoto {
  _id?: string;
  name: string;
  description: string;
  category: string;
  fullSizePath: string;
  halfSizePath: string;
  miniaturePath: string;
  isOnLandingPage?: boolean;
}

/* ------------------------------------------------------------------ */
/* Room (built by studio-room.ts)                                      */
/* ------------------------------------------------------------------ */

/** Camera pose for a station. World space, meters. Y is up. */
export interface StationPose {
  position: Vec3;
  target: Vec3;
  fov: number;
}

/** Anything the user can point at / click in the room. */
export interface Hotspot {
  /** Station that is activated on click. Hero frames use their category id. */
  id: StationId;
  /** World-space point where the HTML label is anchored (slightly below / beside the object). */
  anchor: Vec3;
  /** Objects tested by the raycaster (include invisible generous hit-boxes if useful). */
  pick: THREE.Object3D[];
  /** 0 = idle, 1 = hovered / current. Called every frame with a smoothed value. */
  setHighlight(amount: number): void;
}

/**
 * Big framed photo that shows one category's pictures. Also a Hotspot (id === category).
 * The photo is displayed on two stacked planes so the engine can cross-fade.
 */
export interface HeroFrame extends Hotspot {
  id: PhotoCategory;
  category: PhotoCategory;
  /** World-space center of the photo area on the wall. */
  center: Vec3;
  /** Unit vector pointing from the wall toward the room (direction the frame faces). */
  normal: Vec3;
  /** Largest photo area (meters) the frame can show for any aspect ratio. */
  maxWidth: number;
  maxHeight: number;
  /**
   * Two stacked planes, [back, front]. front is slightly closer to the camera.
   * Both use MeshBasicMaterial({ transparent: true, toneMapped: false }); engine owns `.map` and `.opacity`.
   */
  photoMeshes: [THREE.Mesh, THREE.Mesh];
  /**
   * Reshape the photo planes + black frame border so a photo of this width/height ratio fits
   * inside maxWidth x maxHeight (contain). Planes are unit-sized geometry scaled by the room.
   */
  setPhotoAspect(aspect: number): void;
  /** Current photo plane size in meters (after setPhotoAspect). */
  getPhotoSize(): { width: number; height: number };
}

/** Small decorative frame on the wall (fills the gallery wall like in the real studio). */
export interface DecorFrame {
  /** Aspect ratio (w/h) of the picture area. */
  aspect: number;
  /** Plane showing the picture; MeshBasicMaterial({ toneMapped: false }). Engine sets `.map` with cover-crop. */
  photoMesh: THREE.Mesh;
}

export interface StudioRoom {
  root: THREE.Group;
  heroFrames: Record<PhotoCategory, HeroFrame>;
  decorFrames: DecorFrame[];
  /** Hotspots for the non-photo stations ('studio', 'about', 'contact'). Hero frames are NOT repeated here. */
  extraHotspots: Hotspot[];
  /** Camera pose for every station. For gallery stations this is the "wall" view; slideshow zoom is computed by the engine. */
  stations: Record<StationId, StationPose>;
  /** Called every frame. t = elapsed seconds, dt = delta seconds. Subtle animation only (dust, lamp sway, window glow). */
  update(t: number, dt: number): void;
  /** 0 = normal room light, 1 = dimmed room with a spotlight on the active hero frame (slideshow mode). */
  setFocusMode(amount: number, focus?: PhotoCategory): void;
  /** `quality === 'low'` => no shadows, fewer lights/particles. */
  setQuality(quality: 'high' | 'low'): void;
  dispose(): void;
}

export interface BuildRoomOptions {
  quality: 'high' | 'low';
  renderer: THREE.WebGLRenderer;
}

/* ------------------------------------------------------------------ */
/* Scene engine (studio-scene.ts)                                      */
/* ------------------------------------------------------------------ */

export interface HotspotScreenPos {
  id: StationId;
  /** CSS pixels relative to the canvas top-left. */
  x: number;
  y: number;
  /** False when behind the camera or outside the viewport. */
  visible: boolean;
}

export interface StudioSceneOptions {
  canvas: HTMLCanvasElement;
  quality?: 'high' | 'low';
  /** User clicked / tapped a hotspot in the 3D view. */
  onHotspotClick(id: StationId): void;
  /** Pointer is over a hotspot (or null). Used for cursor + HTML label highlight. */
  onHover(id: StationId | null): void;
  /** Initial asset loading ratio 0..1. */
  onProgress(ratio: number): void;
  /** First frame rendered and initial textures done. */
  onReady(): void;
  /** Called every frame (cheap) with the projected anchor of every hotspot, for HTML labels. */
  onHotspots(positions: HotspotScreenPos[]): void;
}

export interface StudioSceneApi {
  /** Texture shown in each hero frame while not in slideshow (landing photo URL per category). */
  setLandingPhotos(urls: Partial<Record<PhotoCategory, string>>): void;
  /** Pictures for the decorative frames (miniature URLs, any order; engine cycles / crops them). */
  setDecorPhotos(urls: string[]): void;
  /** Lights the object of a station while the user hovers its HTML button (no effect on the focused station). */
  setHoverHint(id: StationId | null): void;
  /**
   * Device-tilt look-around (mobile): when enabled the camera pans a few degrees following the device orientation.
   * On iOS the caller must have obtained DeviceOrientationEvent permission (user gesture) before enabling it.
   */
  setTilt(enabled: boolean): void;
  /** Smooth camera move to a station. Leaves slideshow mode if active. */
  goTo(id: StationId, opts?: { instant?: boolean }): void;
  /**
   * Enter slideshow: camera zooms on the category's hero frame, room dims, frame resizes to the photo aspect.
   * Resolves when the first photo is displayed.
   */
  openGallery(category: PhotoCategory, firstUrl: string): Promise<void>;
  /** Cross-fade to another photo in the active hero frame (slideshow). Resolves once displayed. */
  showPhoto(url: string): Promise<void>;
  /** Leave slideshow, camera returns to the station pose of that category. */
  closeGallery(): void;
  /** Shift the visual center of the 3D view so the subject stays visible next to HTML panels (CSS px). */
  setViewInset(inset: { left: number; right: number; top: number; bottom: number }): void;
  /** Warm the HTTP cache / GPU for an upcoming slideshow photo. */
  preload(url: string): void;
  resize(): void;
  dispose(): void;
}

export type CreateStudioScene = (options: StudioSceneOptions) => StudioSceneApi;
