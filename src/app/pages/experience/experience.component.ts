import { Location } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  OnInit,
  QueryList,
  ViewChild,
  ViewChildren,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Subscription } from 'rxjs';

import {
  sectionInfosByCategory,
  SectionInfo,
} from '../../enum/section-infos-by-category';
import {
  isPhotoCategory,
  photoParamFromUrl,
  STATIONS,
  STATION_META,
  stationFromPath,
  StationMeta,
} from '../../models/station-meta';
import { HttpService } from '../../services/http.service';
import {
  HotspotScreenPos,
  PhotoCategory,
  RemotePhoto,
  StationId,
  StudioSceneApi,
  STATION_ORDER,
} from '../../three/studio.types';

type GalleryState = 'loading' | 'ok' | 'error';

interface DockItem {
  meta: StationMeta;
  /** Position in the global station order (keyboard digit = index + 1). */
  index: number;
  /** Category font for the slideshow universes, null for the informational stations. */
  font: SectionInfo['font'] | null;
}

interface DockGroup {
  id: 'home' | 'gallery' | 'info';
  label: string;
  items: DockItem[];
}
/** Hotspot labels drawn above their anchor dot; they are shifted down on screen (see positionLabels). */
const LABEL_DROP_IDS = new Set<string>(['graphistes', 'about', 'studio']);

type UrlMode = 'push' | 'replace' | 'none';
type LabelMode = 'full' | 'subtle' | 'hidden';

interface HotspotItem {
  id: StationId;
  name: string;
  icon: string;
  isCategory: boolean;
  font: { fontFamily: string; fontWeight: number } | null;
  /** Label sits above its anchor dot (leader line + dot below the button). */
  above: boolean;
}

interface HotspotEntry {
  el: HTMLElement;
  transform: string;
  off: boolean;
  /** Label pinned to the bottom of the screen because its anchor is behind the camera. */
  pinned: boolean;
}

const CATEGORIES: PhotoCategory[] = ['portraits', 'macros', 'graphistes'];
const AUTOPLAY_MS = 5000;
const IDLE_MS = 3000;
const MAX_DECOR = 28;

@Component({
  selector: 'app-experience',
  templateUrl: './experience.component.html',
  styleUrls: ['./experience.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExperienceComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('stage', { static: true }) stageRef!: ElementRef<HTMLElement>;
  @ViewChild('canvas', { static: true })
  canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChildren('hs') hotspotRefs!: QueryList<ElementRef<HTMLElement>>;
  @ViewChildren('panel') panelRefs!: QueryList<ElementRef<HTMLElement>>;
  @ViewChild('thumbs') thumbsRef?: ElementRef<HTMLElement>;

  /* ---------------------------- template state --------------------------- */

  readonly stations: StationMeta[] = STATIONS;
  readonly meta = STATION_META;
  readonly categories = CATEGORIES;
  readonly hotspotItems: HotspotItem[] = this.buildHotspotItems();
  readonly dockGroups: DockGroup[] = this.buildDockGroups();

  station: StationId = 'overview';
  hovered: StationId | null = null;
  activeCategory: PhotoCategory | null = null;
  activeInfo: SectionInfo | null = null;
  /** Single-item array replaced on each panel change so *ngFor re-creates (and re-animates) the panel. */
  panelKeys: StationId[] = [];

  progress = 0;
  ready = false;
  showLoader = true;
  webglFailed = false;
  hintVisible = true;
  isTouch = false;
  isMobile = false;
  fullscreenSupported = false;
  isFullscreen = false;
  announce = '';

  photos: Record<PhotoCategory, RemotePhoto[]> = {
    portraits: [],
    macros: [],
    graphistes: [],
  };
  galleryState: Record<PhotoCategory, GalleryState> = {
    portraits: 'loading',
    macros: 'loading',
    graphistes: 'loading',
  };

  slideshowOpen = false;
  slidePhotos: RemotePhoto[] = [];
  photoIndex = 0;
  slideLoading = false;
  slideError = false;
  controlsVisible = true;
  thumbsOpen = false;
  autoplay = false;
  ringKeys: number[] = [];
  fallbackSrc = '';

  /* ------------------------------ internals ------------------------------ */

  private scene: StudioSceneApi | null = null;
  private destroyed = false;
  private reducedMotion = false;
  private mobileMq!: MediaQueryList;

  private readonly subs = new Subscription();
  private readonly unlisten: Array<() => void> = [];
  private hotspotMap = new Map<string, HotspotEntry>();
  private panelObserver: ResizeObserver | null = null;
  private neighbours = new Set<StationId>();
  private lastInsetKey = '';

  private galleryRequests = new Map<PhotoCategory, Promise<RemotePhoto[]>>();
  private landingMini: Partial<Record<PhotoCategory, string>> = {};
  private landingHalf: Partial<Record<PhotoCategory, string>> = {};
  private landingSent = '';
  private decorUrls: string[] = [];
  private decorSent = false;
  private pendingPhoto: number | null = null;

  private slideSession = 0;
  private shownIndex = -1;
  private sceneBusy = false;
  private autoplayTimer = 0;
  private idleTimer = 0;
  private lastActivity = 0;
  private ringSeq = 0;
  private loaderTimer = 0;
  private failsafeTimer = 0;
  private resizeRaf = 0;

  private lastWheel = 0;
  private wheelAcc = 0;
  private wheelLocked = false;
  private wheelLockAt = 0;
  private touchStart: { x: number; y: number; t: number } | null = null;

  constructor(
    private http: HttpService,
    private location: Location,
    private titleService: Title,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef
  ) {}

  /* ------------------------------- lifecycle ------------------------------ */

  ngOnInit(): void {
    this.isTouch = window.matchMedia('(hover: none)').matches;
    this.mobileMq = window.matchMedia('(max-width: 700px)');
    this.isMobile = this.mobileMq.matches;
    this.reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;
    this.fullscreenSupported = !!document.fullscreenEnabled;

    // URL -> station (no router navigation: the page is never remounted).
    const url = this.location.path();
    this.station = stationFromPath(url);
    const photo = photoParamFromUrl(url);
    if (photo !== null && isPhotoCategory(this.station)) {
      this.pendingPhoto = photo - 1;
    }
    this.refreshStationState();
    this.syncUrl('replace');

    this.subs.add(
      this.location.subscribe(() => this.update(() => this.onPopState()))
    );

    this.fetchData();
  }

  ngAfterViewInit(): void {
    this.buildHotspotMap();
    this.subs.add(this.hotspotRefs.changes.subscribe(() => this.buildHotspotMap()));
    this.observePanels();
    this.subs.add(this.panelRefs.changes.subscribe(() => this.observePanels()));
    this.attachListeners();
    this.updateInset();

    this.failsafeTimer = window.setTimeout(() => {
      if (!this.ready) {
        this.update(() => this.markReady());
      }
    }, 25000);

    this.bootScene();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.subs.unsubscribe();
    this.unlisten.forEach((fn) => fn());
    this.unlisten.length = 0;
    window.clearTimeout(this.autoplayTimer);
    window.clearTimeout(this.idleTimer);
    window.clearTimeout(this.loaderTimer);
    window.clearTimeout(this.failsafeTimer);
    cancelAnimationFrame(this.resizeRaf);
    this.panelObserver?.disconnect();
    this.scene?.dispose();
    this.scene = null;
  }

  /* ------------------------------ scene boot ------------------------------ */

  private async bootScene(): Promise<void> {
    try {
      // ngAfterViewInit runs inside a change-detection pass: wait a tick before touching bound state.
      await Promise.resolve();
      this.update(() => this.setProgress(0.06));
      const mod = await import('../../three/studio-scene');
      if (this.destroyed) {
        return;
      }
      this.update(() => this.setProgress(0.12));
      const scene = this.ngZone.runOutsideAngular(() =>
        mod.createStudioScene({
          canvas: this.canvasRef.nativeElement,
          quality: this.pickQuality(),
          onHotspotClick: (id) => this.update(() => this.onHotspotClick(id)),
          onHover: (id) => {
            if (id !== this.hovered) {
              this.update(() => (this.hovered = id));
            }
          },
          onProgress: (ratio) =>
            this.update(() => this.setProgress(0.12 + 0.88 * ratio)),
          onReady: () => this.update(() => this.markReady()),
          onHotspots: (positions) => this.positionLabels(positions),
        })
      );
      if (this.destroyed) {
        scene.dispose();
        return;
      }
      this.scene = scene;
      if (this.station !== 'overview') {
        scene.goTo(this.station, { instant: this.reducedMotion });
      }
      this.applySceneData();
      this.updateInset();
    } catch (err) {
      console.warn('[experience] 3D scene unavailable, using static fallback', err);
      this.scene?.dispose();
      this.scene = null;
      this.update(() => {
        this.webglFailed = true;
        this.setProgress(1);
        this.markReady();
      });
    }
  }

  private pickQuality(): 'high' | 'low' {
    const small = Math.min(window.innerWidth, window.innerHeight) <= 820;
    return this.isTouch && small ? 'low' : 'high';
  }

  private setProgress(value: number): void {
    this.progress = Math.max(this.progress, Math.min(1, value));
  }

  private markReady(): void {
    if (this.ready) {
      return;
    }
    this.ready = true;
    this.progress = 1;
    window.clearTimeout(this.failsafeTimer);
    this.loaderTimer = window.setTimeout(
      () => this.update(() => (this.showLoader = false)),
      1100
    );
    this.updateInset();
    this.tryPendingPhoto();
  }

  /* --------------------------------- data --------------------------------- */

  private fetchData(): void {
    this.subs.add(
      this.http.getLandingPagePics().subscribe(
        (list) => {
          this.buildLanding(Array.isArray(list) ? list : []);
          this.applySceneData();
        },
        () => undefined
      )
    );

    // Portraits first (their panel is the most likely entry point), then the rest.
    Promise.all(CATEGORIES.map((cat) => this.loadGallery(cat))).then(() => {
      this.buildDecor();
      this.applySceneData();
    });
  }

  loadGallery(cat: PhotoCategory): Promise<RemotePhoto[]> {
    let request = this.galleryRequests.get(cat);
    if (!request) {
      this.galleryState[cat] = 'loading';
      request = new Promise<RemotePhoto[]>((resolve) => {
        this.subs.add(
          this.http.getGalleryFromCategory(cat).subscribe(
            (res) => {
              // Backend returns oldest first: newest pictures lead the slideshow.
              const list = (Array.isArray(res) ? res : []).slice().reverse();
              this.photos[cat] = list;
              this.galleryState[cat] = list.length ? 'ok' : 'error';
              if (!list.length) {
                this.galleryRequests.delete(cat);
              }
              this.update();
              resolve(list);
            },
            () => {
              this.galleryState[cat] = 'error';
              this.galleryRequests.delete(cat);
              this.update();
              resolve([]);
            }
          )
        );
      }).then((list) => {
        this.tryPendingPhoto();
        return list;
      });
      this.galleryRequests.set(cat, request);
    }
    return request;
  }

  enterGallery(): void {
    if (this.activeCategory) {
      this.openSlideshow(this.activeCategory);
    }
  }

  retryActiveGallery(): void {
    if (this.activeCategory) {
      this.retryGallery(this.activeCategory);
    }
  }

  retryGallery(cat: PhotoCategory): void {
    this.galleryRequests.delete(cat);
    this.galleryState[cat] = 'loading';
    this.loadGallery(cat);
  }

  private buildLanding(list: RemotePhoto[]): void {
    for (const photo of list) {
      const cat = (photo.category || '').toLowerCase();
      if (isPhotoCategory(cat)) {
        this.landingMini[cat] = photo.miniaturePath || photo.halfSizePath;
        this.landingHalf[cat] = photo.halfSizePath || photo.miniaturePath;
      }
    }
  }

  private buildDecor(): void {
    // Weighted round-robin: the real gallery wall is mostly dark portraits.
    const pools = [
      this.photos.portraits,
      this.photos.macros,
      this.photos.portraits.slice(Math.ceil(this.photos.portraits.length / 2)),
      this.photos.graphistes,
    ];
    const urls: string[] = [];
    const cursor = [0, 0, 0, 0];
    for (let guard = 0; urls.length < MAX_DECOR && guard < 400; guard++) {
      const k = guard % pools.length;
      const photo = pools[k][cursor[k]++];
      if (photo && photo.miniaturePath && urls.indexOf(photo.miniaturePath) < 0) {
        urls.push(photo.miniaturePath);
      }
    }
    this.decorUrls = urls;
    this.decorSent = false;
  }

  /** Pushes whatever data is available to the engine (idempotent, safe to call repeatedly). */
  private applySceneData(): void {
    const scene = this.scene;
    if (!scene) {
      return;
    }
    const miniKey = JSON.stringify(this.landingMini);
    if (miniKey !== '{}' && this.landingSent !== miniKey) {
      this.landingSent = miniKey;
      scene.setLandingPhotos({ ...this.landingMini });
      // Upgrade to the sharper half-size pictures once the HTTP cache is warm.
      const half = { ...this.landingHalf };
      const urls = CATEGORIES.map((c) => half[c]).filter((u): u is string => !!u);
      Promise.all(urls.map((u) => this.warmImage(u))).then(() => {
        if (!this.destroyed && this.scene === scene) {
          scene.setLandingPhotos(half);
        }
      });
    }
    if (this.decorUrls.length && !this.decorSent) {
      this.decorSent = true;
      scene.setDecorPhotos(this.decorUrls.slice());
    }
  }

  photoCount(cat: PhotoCategory): number {
    return this.photos[cat].length;
  }

  previewThumbs(cat: PhotoCategory): RemotePhoto[] {
    return this.photos[cat].slice(0, 4);
  }

  /* ------------------------------ navigation ------------------------------ */

  get panelShown(): boolean {
    return this.station !== 'overview' && !this.slideshowOpen;
  }

  goTo(id: StationId, opts: { url?: UrlMode } = {}): void {
    const wasSlideshow = this.slideshowOpen;
    if (id === this.station && !wasSlideshow) {
      return;
    }
    if (wasSlideshow) {
      this.endSlideshowState();
    }
    this.pendingPhoto = null;
    this.station = id;
    this.scene?.goTo(id, { instant: this.reducedMotion });
    this.afterStationChange(opts.url || 'push');
  }

  /** Hovering a dock button or a label lights the matching object in the 3D room. */
  hintHover(id: StationId | null): void {
    this.scene?.setHoverHint(id);
  }

  /** Dock click: clicking the active gallery station again enters it. */
  onDockClick(id: StationId): void {
    if (id === this.station && isPhotoCategory(id) && !this.slideshowOpen) {
      this.openSlideshow(id);
    } else {
      this.goTo(id);
    }
  }

  /** Click on a 3D hotspot or one of its HTML labels. */
  onHotspotClick(id: StationId): void {
    this.noteInteraction();
    if (id === this.station && isPhotoCategory(id) && !this.slideshowOpen) {
      this.openSlideshow(id);
    } else {
      this.goTo(id);
    }
  }

  stepStation(delta: number): void {
    const n = STATION_ORDER.length;
    const i = STATION_ORDER.indexOf(this.station);
    this.goTo(STATION_ORDER[(i + delta + n) % n]);
  }

  private afterStationChange(urlMode: UrlMode): void {
    this.refreshStationState();
    this.syncUrl(urlMode);
    this.updateInset();
    this.cdr.markForCheck();
  }

  /** Recomputes everything derived from `station` / `slideshowOpen`. */
  private refreshStationState(): void {
    this.activeCategory = isPhotoCategory(this.station) ? this.station : null;
    this.activeInfo = this.activeCategory
      ? sectionInfosByCategory.get(this.activeCategory) || null
      : null;
    this.panelKeys = this.panelShown ? [this.station] : [];
    const n = STATION_ORDER.length;
    const i = STATION_ORDER.indexOf(this.station);
    this.neighbours = new Set<StationId>([
      STATION_ORDER[(i + 1) % n],
      STATION_ORDER[(i - 1 + n) % n],
    ]);
    const meta = STATION_META[this.station];
    this.titleService.setTitle(meta.title);
    this.announce = meta.label;
  }

  labelMode(id: StationId): LabelMode {
    if (this.slideshowOpen || this.webglFailed || !this.ready) {
      return 'hidden';
    }
    if (this.station === 'overview') {
      return 'full';
    }
    return this.neighbours.has(id) ? 'subtle' : 'hidden';
  }

  /* ----------------------------------- URL ---------------------------------- */

  private syncUrl(mode: UrlMode): void {
    if (mode === 'none') {
      return;
    }
    const path = STATION_META[this.station].path;
    // A deep-linked photo stays in the URL until the slideshow actually opens.
    const photo = this.slideshowOpen ? this.photoIndex : this.pendingPhoto;
    const query = photo !== null ? `?photo=${photo + 1}` : '';
    if (this.location.path() === path + query) {
      return;
    }
    if (mode === 'push') {
      this.location.go(path, query);
    } else {
      this.location.replaceState(path, query);
    }
  }

  private onPopState(): void {
    const url = this.location.path();
    const target = stationFromPath(url);
    const photo = photoParamFromUrl(url);
    if (isPhotoCategory(target) && photo !== null) {
      if (this.slideshowOpen && this.activeCategory === target) {
        this.setPhoto(photo - 1, 'none');
      } else {
        if (target !== this.station || this.slideshowOpen) {
          this.goTo(target, { url: 'none' });
        }
        this.pendingPhoto = photo - 1;
        this.tryPendingPhoto();
      }
      return;
    }
    if (this.slideshowOpen && target === this.station) {
      this.closeSlideshow({ url: 'none' });
    } else {
      this.goTo(target, { url: 'none' });
    }
  }

  private tryPendingPhoto(): void {
    const cat = this.activeCategory;
    if (this.pendingPhoto === null || !cat || !(this.ready || this.webglFailed)) {
      return;
    }
    const state = this.galleryState[cat];
    if (state === 'error') {
      this.pendingPhoto = null;
    } else if (state === 'ok' && this.photos[cat].length) {
      const idx = this.pendingPhoto;
      this.pendingPhoto = null;
      this.openSlideshow(cat, idx, 'replace');
    }
  }

  /* -------------------------------- slideshow ------------------------------- */

  async openSlideshow(
    cat: PhotoCategory,
    index = 0,
    urlMode: UrlMode = 'replace'
  ): Promise<void> {
    if (this.slideshowOpen && this.activeCategory === cat) {
      return;
    }
    let list = this.photos[cat];
    if (!list.length) {
      list = await this.loadGallery(cat);
      this.cdr.markForCheck();
      if (!list.length || this.destroyed || this.slideshowOpen) {
        return;
      }
      if (this.station !== cat) {
        return;
      }
    }
    const idx = Math.min(Math.max(0, index), list.length - 1);
    this.slideshowOpen = true;
    this.station = cat;
    this.slidePhotos = list;
    this.photoIndex = idx;
    this.shownIndex = -1;
    this.sceneBusy = true;
    this.slideLoading = true;
    this.slideError = false;
    this.controlsVisible = true;
    this.thumbsOpen = false;
    this.fallbackSrc = '';
    const session = ++this.slideSession;
    this.armIdle();

    const first = list[idx].halfSizePath;
    const shown = this.scene
      ? this.scene.openGallery(cat, first)
      : this.fallbackDisplay(first);
    shown.then(
      () => this.update(() => this.onDisplayed(session, idx)),
      () => this.update(() => this.onDisplayFailed(session, idx))
    );
    this.preloadAround(idx);
    this.afterStationChange(urlMode);
  }

  closeSlideshow(opts: { url?: UrlMode } = {}): void {
    if (!this.slideshowOpen) {
      return;
    }
    this.endSlideshowState();
    this.scene?.closeGallery();
    this.afterStationChange(opts.url || 'replace');
  }

  private endSlideshowState(): void {
    this.slideshowOpen = false;
    this.slideSession++;
    this.sceneBusy = false;
    this.slideLoading = false;
    this.slideError = false;
    this.controlsVisible = true;
    this.thumbsOpen = false;
    this.autoplay = false;
    this.ringKeys = [];
    this.fallbackSrc = '';
    window.clearTimeout(this.autoplayTimer);
    window.clearTimeout(this.idleTimer);
  }

  nextPhoto(): void {
    this.stepPhoto(1);
  }

  prevPhoto(): void {
    this.stepPhoto(-1);
  }

  stepPhoto(delta: number): void {
    this.setPhoto(this.photoIndex + delta, 'replace');
  }

  setPhoto(index: number, urlMode: UrlMode = 'replace'): void {
    const n = this.slidePhotos.length;
    if (!this.slideshowOpen || !n) {
      return;
    }
    const idx = ((index % n) + n) % n;
    if (idx === this.photoIndex) {
      return;
    }
    this.photoIndex = idx;
    this.slideLoading = this.shownIndex !== idx;
    this.slideError = false;
    this.stopAutoplayTimer();
    this.syncUrl(urlMode);
    this.preloadAround(idx);
    this.scrollThumbIntoView();
    this.showControls();
    this.pump();
    this.cdr.markForCheck();
  }

  private onDisplayed(session: number, idx: number): void {
    if (session !== this.slideSession) {
      return;
    }
    this.sceneBusy = false;
    this.shownIndex = idx;
    this.pump();
  }

  private onDisplayFailed(session: number, idx: number): void {
    if (session !== this.slideSession) {
      return;
    }
    this.sceneBusy = false;
    this.shownIndex = idx;
    this.slideError = idx === this.photoIndex;
    this.pump();
  }

  /** Keeps the 3D frame in sync with `photoIndex` with at most one in-flight texture request. */
  private pump(): void {
    if (!this.slideshowOpen || this.sceneBusy) {
      return;
    }
    if (this.shownIndex === this.photoIndex) {
      this.slideLoading = false;
      this.startAutoplayTimer();
      this.cdr.markForCheck();
      return;
    }
    const session = this.slideSession;
    const want = this.photoIndex;
    const url = this.slidePhotos[want].halfSizePath;
    this.sceneBusy = true;
    const shown = this.scene ? this.scene.showPhoto(url) : this.fallbackDisplay(url);
    shown.then(
      () => this.update(() => this.onDisplayed(session, want)),
      () => this.update(() => this.onDisplayFailed(session, want))
    );
  }

  private fallbackDisplay(url: string): Promise<void> {
    return this.loadImage(url).then(() => {
      this.fallbackSrc = url;
    });
  }

  private preloadAround(idx: number): void {
    const n = this.slidePhotos.length;
    [1, -1, 2].forEach((d) => {
      const photo = this.slidePhotos[(idx + d + n) % n];
      if (!photo || (d !== 1 && n < 3)) {
        return;
      }
      if (this.scene) {
        this.scene.preload(photo.halfSizePath);
      } else {
        this.warmImage(photo.halfSizePath);
      }
    });
  }

  get currentPhoto(): RemotePhoto | null {
    return this.slidePhotos[this.photoIndex] || null;
  }

  openFullSize(): void {
    const photo = this.currentPhoto;
    if (photo) {
      const w = window.open(photo.fullSizePath, '_blank');
      if (w) {
        w.opener = null;
      }
    }
  }

  toggleThumbs(): void {
    this.thumbsOpen = !this.thumbsOpen;
    this.scrollThumbIntoView();
    this.showControls();
  }

  toggleAutoplay(): void {
    this.autoplay = !this.autoplay;
    if (this.autoplay) {
      if (this.shownIndex === this.photoIndex) {
        this.startAutoplayTimer();
      }
    } else {
      this.stopAutoplayTimer();
    }
  }

  private startAutoplayTimer(): void {
    this.stopAutoplayTimer();
    if (!this.autoplay || !this.slideshowOpen || this.slidePhotos.length < 2) {
      return;
    }
    this.ringKeys = [++this.ringSeq];
    this.autoplayTimer = window.setTimeout(
      () => this.update(() => this.stepPhoto(1)),
      AUTOPLAY_MS
    );
  }

  private stopAutoplayTimer(): void {
    window.clearTimeout(this.autoplayTimer);
    if (this.ringKeys.length) {
      this.ringKeys = [];
    }
  }

  private scrollThumbIntoView(): void {
    if (!this.thumbsOpen) {
      return;
    }
    this.ngZone.runOutsideAngular(() =>
      requestAnimationFrame(() => {
        const strip = this.thumbsRef?.nativeElement;
        const el = strip?.children[this.photoIndex] as HTMLElement | undefined;
        if (el && strip) {
          const target = el.offsetLeft - strip.clientWidth / 2 + el.offsetWidth / 2;
          strip.scrollTo({
            left: target,
            behavior: this.reducedMotion ? 'auto' : 'smooth',
          });
        }
      })
    );
  }

  /** Auto-hide of the slideshow chrome after a short pointer inactivity. */
  private armIdle(): void {
    window.clearTimeout(this.idleTimer);
    this.idleTimer = window.setTimeout(() => {
      if (!this.slideshowOpen) {
        return;
      }
      if (this.thumbsOpen) {
        this.armIdle();
        return;
      }
      if (this.controlsVisible) {
        this.update(() => (this.controlsVisible = false));
      }
    }, IDLE_MS);
  }

  private showControls(): void {
    if (!this.slideshowOpen) {
      return;
    }
    this.armIdle();
    if (!this.controlsVisible) {
      this.update(() => (this.controlsVisible = true));
    }
  }

  /* ----------------------------- input handling ---------------------------- */

  private attachListeners(): void {
    const stage = this.stageRef.nativeElement;
    this.ngZone.runOutsideAngular(() => {
      this.on(document, 'keydown', this.onKeyDown as EventListener);
      this.on(document, 'pointermove', this.onPointerMove as EventListener, {
        passive: true,
      });
      this.on(document, 'pointerdown', this.onPointerDown as EventListener, {
        passive: true,
      });
      this.on(document, 'fullscreenchange', () =>
        this.update(() => {
          this.isFullscreen = !!document.fullscreenElement;
          this.queueResize();
        })
      );
      this.on(window, 'resize', () => this.queueResize());
      this.on(stage, 'wheel', this.onWheel as EventListener, { passive: true });
      this.on(stage, 'touchstart', this.onTouchStart as EventListener, {
        passive: true,
      });
      this.on(stage, 'touchend', this.onTouchEnd as EventListener, {
        passive: true,
      });
      const onMq = () =>
        this.update(() => {
          this.isMobile = this.mobileMq.matches;
          this.updateInset();
        });
      if (this.mobileMq.addEventListener) {
        this.mobileMq.addEventListener('change', onMq);
        this.unlisten.push(() => this.mobileMq.removeEventListener('change', onMq));
      }
    });
  }

  private on(
    target: EventTarget,
    type: string,
    handler: EventListener,
    options?: AddEventListenerOptions
  ): void {
    target.addEventListener(type, handler, options);
    this.unlisten.push(() => target.removeEventListener(type, handler, options));
  }

  private queueResize(): void {
    cancelAnimationFrame(this.resizeRaf);
    this.resizeRaf = requestAnimationFrame(() => {
      this.scene?.resize();
      this.updateInset();
    });
  }

  /** First real interaction: the keyboard hint has done its job. */
  private noteInteraction(): void {
    if (this.hintVisible) {
      this.hintVisible = false;
      this.cdr.markForCheck();
    }
    this.showControls();
  }

  private onPointerMove = (): void => {
    const now = performance.now();
    if (this.slideshowOpen && now - this.lastActivity > 120) {
      this.lastActivity = now;
      this.showControls();
    }
  };

  private onPointerDown = (): void => {
    this.update(() => this.noteInteraction());
  };

  private onKeyDown = (ev: KeyboardEvent): void => {
    if (ev.defaultPrevented || ev.ctrlKey || ev.metaKey || ev.altKey) {
      return;
    }
    const target = ev.target as HTMLElement | null;
    if (
      target &&
      (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
    ) {
      return;
    }
    const interactive = !!target && !!target.closest('button, a[href], summary');
    const key = ev.key;

    if (key === 'ArrowRight' || key === 'ArrowLeft') {
      const dir = key === 'ArrowRight' ? 1 : -1;
      ev.preventDefault();
      this.update(() => {
        this.noteInteraction();
        if (this.slideshowOpen) {
          this.stepPhoto(dir);
        } else if (!ev.repeat) {
          this.stepStation(dir);
        }
      });
    } else if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
      if (interactive) {
        return; // let the focused control keep its native behaviour
      }
      ev.preventDefault();
      this.update(() => {
        this.noteInteraction();
        if (this.slideshowOpen) {
          if (key !== 'Enter') {
            this.stepPhoto(1);
          }
        } else if (this.activeCategory) {
          this.openSlideshow(this.activeCategory);
        }
      });
    } else if (key === 'Escape') {
      this.update(() => {
        this.noteInteraction();
        if (this.slideshowOpen) {
          this.closeSlideshow();
        } else if (this.station !== 'overview') {
          this.goTo('overview');
        }
      });
    } else if (/^[1-7]$/.test(key)) {
      this.update(() => {
        this.noteInteraction();
        this.goTo(STATION_ORDER[parseInt(key, 10) - 1]);
      });
    }
  };

  private onWheel = (ev: WheelEvent): void => {
    if (ev.ctrlKey) {
      return; // pinch-zoom gesture
    }
    const now = performance.now();
    const gap = now - this.lastWheel;
    this.lastWheel = now;
    if (gap > 220) {
      this.wheelAcc = 0;
    }
    if (this.wheelLocked) {
      // Wait for inertia to settle before accepting a new step.
      if (gap > 170 && now - this.wheelLockAt > 450) {
        this.wheelLocked = false;
      } else {
        return;
      }
    }
    const unit = ev.deltaMode === 1 ? 16 : 1;
    const delta =
      (Math.abs(ev.deltaX) > Math.abs(ev.deltaY) ? ev.deltaX : ev.deltaY) * unit;
    this.wheelAcc += delta;
    if (Math.abs(this.wheelAcc) < 40) {
      return;
    }
    const dir = this.wheelAcc > 0 ? 1 : -1;
    this.wheelAcc = 0;
    this.wheelLocked = true;
    this.wheelLockAt = now;
    this.update(() => {
      this.noteInteraction();
      if (this.slideshowOpen) {
        this.stepPhoto(dir);
      } else {
        this.stepStation(dir);
      }
    });
  };

  private onTouchStart = (ev: TouchEvent): void => {
    if (ev.touches.length !== 1) {
      this.touchStart = null;
      return;
    }
    const t = ev.touches[0];
    this.touchStart = { x: t.clientX, y: t.clientY, t: performance.now() };
  };

  private onTouchEnd = (ev: TouchEvent): void => {
    const start = this.touchStart;
    this.touchStart = null;
    const t = ev.changedTouches[0];
    if (!start || !t) {
      return;
    }
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (
      Math.abs(dx) < 56 ||
      Math.abs(dx) < Math.abs(dy) * 1.6 ||
      performance.now() - start.t > 800
    ) {
      return;
    }
    const dir = dx < 0 ? 1 : -1;
    this.update(() => {
      this.noteInteraction();
      if (this.slideshowOpen) {
        this.stepPhoto(dir);
      } else {
        this.stepStation(dir);
      }
    });
  };

  toggleFullscreen(): void {
    if (document.fullscreenElement) {
      const p = document.exitFullscreen();
      if (p) {
        p.catch(() => undefined);
      }
    } else {
      const p = document.documentElement.requestFullscreen();
      if (p) {
        p.catch(() => undefined);
      }
    }
  }

  /* ----------------------- hotspot labels (per frame) ---------------------- */

  /** Dock layout: home, then the three slideshow universes, then the informational stations. */
  private buildDockGroups(): DockGroup[] {
    const item = (id: StationId): DockItem => ({
      meta: STATION_META[id],
      index: STATION_ORDER.indexOf(id),
      font: isPhotoCategory(id) ? sectionInfosByCategory.get(id)?.font ?? null : null,
    });
    return [
      { id: 'home', label: 'Accueil', items: [item('overview')] },
      {
        id: 'gallery',
        label: 'Galeries photo',
        items: (['portraits', 'macros', 'graphistes'] as StationId[]).map(item),
      },
      {
        id: 'info',
        label: 'Informations',
        items: (['studio', 'about', 'contact'] as StationId[]).map(item),
      },
    ];
  }

  private buildHotspotItems(): HotspotItem[] {
    const ids: StationId[] = [
      'portraits',
      'macros',
      'graphistes',
      'studio',
      'about',
      'contact',
    ];
    const extra: Partial<Record<StationId, string>> = {
      studio: 'Le Studio',
      about: 'À propos',
      contact: 'Contact',
    };
    return ids.map((id) => {
      const info = isPhotoCategory(id) ? sectionInfosByCategory.get(id) : undefined;
      return {
        id,
        name: info ? info.name : extra[id] || STATION_META[id].label,
        icon: STATION_META[id].icon,
        isCategory: !!info,
        font: info ? info.font : null,
        above: id === 'graphistes' || id === 'about' || id === 'studio',
      };
    });
  }

  private buildHotspotMap(): void {
    const map = new Map<string, HotspotEntry>();
    this.hotspotRefs.forEach((ref) => {
      const el = ref.nativeElement;
      map.set(el.getAttribute('data-id') || '', {
        el,
        transform: '',
        off: true,
        pinned: false,
      });
    });
    this.hotspotMap = map;
  }

  /** Runs every frame, outside Angular: imperative writes only, no change detection. */
  private positionLabels(positions: HotspotScreenPos[]): void {
    for (const p of positions) {
      const entry = this.hotspotMap.get(p.id);
      if (!entry) {
        continue;
      }
      // Behind the camera on the home view (the lighting set): pin the label near the bottom edge.
      const pinned = p.id === 'studio' && !p.visible && this.station === 'overview';
      if (pinned !== entry.pinned) {
        entry.pinned = pinned;
        entry.el.classList.toggle('pinned', pinned);
      }
      const off = !p.visible && !pinned;
      if (off !== entry.off) {
        entry.off = off;
        entry.el.classList.toggle('off', off);
      }
      if (!off) {
        let x = p.x;
        let y = p.y;
        if (pinned) {
          const narrow = window.innerWidth <= 700;
          // stay clear of the hero text on the left
          x = narrow
            ? window.innerWidth - 92
            : window.innerWidth / 2 + Math.max(0, 1300 - window.innerWidth) * 0.15;
          y = window.innerHeight - (narrow ? 150 : 158);
        } else if (LABEL_DROP_IDS.has(p.id)) {
          // "above" labels sit lower on screen so their dot points at the object, not past it
          y += Math.min(80, window.innerHeight * 0.095);
        }
        const transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
        if (transform !== entry.transform) {
          entry.transform = transform;
          entry.el.style.transform = transform;
        }
      }
    }
  }

  /* -------------------------------- view inset ------------------------------ */

  private observePanels(): void {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    this.panelObserver?.disconnect();
    this.panelObserver = new ResizeObserver(() => this.updateInset());
    this.panelRefs.forEach((ref) => this.panelObserver?.observe(ref.nativeElement));
    this.ngZone.runOutsideAngular(() =>
      requestAnimationFrame(() => this.updateInset())
    );
  }

  /** Shifts the 3D view so the subject stays visible next to the panel / bottom sheet. */
  private updateInset(): void {
    if (!this.scene) {
      return;
    }
    let right = 0;
    let bottom = 0;
    if (this.panelShown) {
      if (this.isMobile) {
        const el = this.panelRefs && this.panelRefs.first;
        const h = el ? el.nativeElement.offsetHeight : window.innerHeight * 0.4;
        bottom = Math.round(Math.min(h, window.innerHeight * 0.46) + 84);
      } else {
        right = Math.round(Math.min(440, window.innerWidth * 0.36) + 56);
      }
    }
    const key = `${right}|${bottom}`;
    if (key === this.lastInsetKey) {
      return;
    }
    this.lastInsetKey = key;
    this.scene.setViewInset({ left: 0, right, top: 0, bottom });
  }

  /* --------------------------------- helpers -------------------------------- */

  /** Runs `fn` inside the Angular zone and schedules an OnPush check. */
  private update(fn?: () => void): void {
    if (this.destroyed) {
      return;
    }
    this.ngZone.run(() => {
      if (fn) {
        fn();
      }
      this.cdr.markForCheck();
    });
  }

  private loadImage(url: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('image failed: ' + url));
      img.src = url;
    });
  }

  private warmImage(url: string): Promise<void> {
    return this.loadImage(url).catch(() => undefined);
  }

  trackById(_: number, item: { id: string }): string {
    return item.id;
  }

  trackByIndex(index: number): number {
    return index;
  }
}
