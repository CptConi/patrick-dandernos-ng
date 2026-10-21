import * as THREE from 'three';

export interface Photo {
  url: string;
  texture: THREE.Texture;
  /** Intrinsic width / height of the image. */
  aspect: number;
  /** Pinned photos (landing + decor) never count toward the LRU budget and are never evicted. */
  pinned: boolean;
}

/**
 * Shared texture loader with a small LRU cache.
 * Map insertion order is the LRU order (oldest first).
 */
export class TextureStore {
  /** Set by the owner: textures currently displayed must never be disposed. */
  isInUse: (texture: THREE.Texture) => boolean = () => false;

  private readonly loader = new THREE.TextureLoader();
  private readonly photos = new Map<string, Photo>();
  private readonly pending = new Map<string, Promise<Photo | null>>();
  private readonly anisotropy: number;
  private disposed = false;

  constructor(renderer: THREE.WebGLRenderer, private readonly maxUnpinned = 8) {
    this.loader.setCrossOrigin('anonymous');
    this.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  }

  /** Returns a cached photo (and marks it as recently used) without loading. */
  peek(url: string): Photo | null {
    const photo = this.photos.get(url);
    if (!photo) {
      return null;
    }
    this.photos.delete(url);
    this.photos.set(url, photo);
    return photo;
  }

  /** Resolves null on error (never rejects). */
  load(url: string, pin = false): Promise<Photo | null> {
    const cached = this.peek(url);
    if (cached) {
      if (pin) {
        cached.pinned = true;
      }
      return Promise.resolve(cached);
    }
    let promise = this.pending.get(url);
    if (!promise) {
      promise = new Promise<Photo | null>((resolve) => {
        this.loader.load(
          url,
          (texture) => {
            this.pending.delete(url);
            if (this.disposed) {
              texture.dispose();
              resolve(null);
              return;
            }
            resolve(this.register(url, texture));
          },
          undefined,
          () => {
            this.pending.delete(url);
            console.warn('[studio] failed to load texture', url);
            resolve(null);
          }
        );
      });
      this.pending.set(url, promise);
    }
    if (!pin) {
      return promise;
    }
    return promise.then((photo) => {
      if (photo) {
        photo.pinned = true;
      }
      return photo;
    });
  }

  unpin(url: string): void {
    const photo = this.photos.get(url);
    if (photo) {
      photo.pinned = false;
      this.evict(photo);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.photos.forEach((photo) => photo.texture.dispose());
    this.photos.clear();
    this.pending.clear();
  }

  private register(url: string, texture: THREE.Texture): Photo {
    texture.encoding = THREE.sRGBEncoding;
    texture.anisotropy = this.anisotropy;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    const image = texture.image as { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number };
    const w = image.naturalWidth || image.width || 3;
    const h = image.naturalHeight || image.height || 2;
    const photo: Photo = { url, texture, aspect: w / h, pinned: false };
    this.photos.set(url, photo);
    this.evict(photo);
    return photo;
  }

  private evict(keep: Photo): void {
    let count = 0;
    this.photos.forEach((p) => {
      if (!p.pinned) {
        count++;
      }
    });
    if (count <= this.maxUnpinned) {
      return;
    }
    for (const [url, p] of Array.from(this.photos.entries())) {
      if (count <= this.maxUnpinned) {
        break;
      }
      if (p.pinned || p === keep || this.isInUse(p.texture)) {
        continue;
      }
      this.photos.delete(url);
      p.texture.dispose();
      count--;
    }
  }
}
