import {
  PhotoCategory,
  StationId,
  STATION_ORDER,
} from '../three/studio.types';

export const SITE_NAME = "Patrick d'Andernos";

export interface StationMeta {
  id: StationId;
  /** Short label used by the dock and tooltips. */
  label: string;
  /** Material Icons ligature. */
  icon: string;
  /** Canonical URL path (legacy paths of the old multi-page site are kept). */
  path: string;
  /** document.title */
  title: string;
}

export const STATION_META: Record<StationId, StationMeta> = {
  overview: {
    id: 'overview',
    label: 'Accueil',
    icon: 'home',
    path: '/',
    title: `${SITE_NAME} — Photographe`,
  },
  portraits: {
    id: 'portraits',
    label: 'Portraits',
    icon: 'person',
    path: '/studio-portrait',
    title: `${SITE_NAME} — Studio Portraits`,
  },
  macros: {
    id: 'macros',
    label: 'Macros',
    icon: 'camera',
    path: '/mondes-macros',
    title: `${SITE_NAME} — Monde Macros`,
  },
  graphistes: {
    id: 'graphistes',
    label: 'Graphistes',
    icon: 'brush',
    path: '/au-cafe-des-graphistes',
    title: `${SITE_NAME} — Au Café des graphistes`,
  },
  studio: {
    id: 'studio',
    label: 'Studio',
    icon: 'light_mode',
    path: '/studio',
    title: `${SITE_NAME} — Le Studio`,
  },
  about: {
    id: 'about',
    label: 'À propos',
    icon: 'info',
    path: '/about',
    title: `${SITE_NAME} — À propos`,
  },
  contact: {
    id: 'contact',
    label: 'Contact',
    icon: 'mail',
    path: '/contact',
    title: `${SITE_NAME} — Contact`,
  },
};

/** Stations in dock / keyboard order. */
export const STATIONS: StationMeta[] = STATION_ORDER.map(
  (id) => STATION_META[id]
);

const PATH_ALIASES: Record<string, StationId> = {
  '/home': 'overview',
  '/macros': 'macros',
  '/portraits': 'portraits',
  '/graphistes': 'graphistes',
};

export function isPhotoCategory(id: string | null | undefined): id is PhotoCategory {
  return id === 'portraits' || id === 'macros' || id === 'graphistes';
}

/** Maps a URL (path, optional query / hash) to a station. Unknown paths => overview. */
export function stationFromPath(url: string): StationId {
  const clean = url.split(/[?#]/)[0].replace(/^\/+|\/+$/g, '').toLowerCase();
  const path = '/' + clean;
  for (const id of STATION_ORDER) {
    if (STATION_META[id].path === path) {
      return id;
    }
  }
  return PATH_ALIASES[path] || 'overview';
}

/** Reads `?photo=N` (1-based) from a URL, or null. */
export function photoParamFromUrl(url: string): number | null {
  const match = /[?&]photo=(\d{1,5})(?:&|#|$)/.exec(url);
  if (!match) {
    return null;
  }
  const n = parseInt(match[1], 10);
  return n >= 1 ? n : null;
}
