# Patrick d'Andernos — portfolio

Angular 12 + three.js (r150) single-page site. The landing page is a real-time 3D
reconstruction of the photo studio: pick a section by clicking objects in the room or
with the arrow keys; photo categories open as a slideshow inside the framed prints on the wall.

The output is **100 % static files** (`dist/patrick-dandernos-ng`): it is hosted as-is on S3.

## Develop

```bash
npm install --legacy-peer-deps
npm start            # http://localhost:4200
```

Node 17+ needs `NODE_OPTIONS=--openssl-legacy-provider` for the Angular 12 webpack; the npm scripts already set it.

## Build & deploy (S3 static website)

```bash
npm run build
./scripts/deploy.sh                 # back up the live site, then deploy
./scripts/deploy.sh --restore       # roll back: put the latest backup back online
```

What the script does:

1. copies the live bucket into `.deploy-backups/<timestamp>/` first (git-ignored, the last 5 are kept; skip with `--no-backup`)
2. hashed bundles (`*.js`, `*.css`) and `assets/` are uploaded with `Cache-Control: public, max-age=31536000, immutable`
3. `index.html` is uploaded with `Cache-Control: no-cache` so a new release is picked up immediately
4. old files are removed from the bucket (`--delete`)

`--restore [dir]` asks for confirmation, then re-publishes a backup (the latest one, or the given directory) with the same cache headers.

Bucket requirements (unchanged from the previous version of the site):

- Static website hosting enabled, **index document** `index.html`
- **Error document** `index.html` (deep links such as `/mondes-macros`, `/studio`, `/contact` are resolved
  client-side; S3 answers them with the SPA shell). With CloudFront in front, map 403/404 to `/index.html` with status 200 instead.
- Public read access (bucket policy) as before

The photo galleries are still served by the existing backend (`http://15.237.23.153:3001`, CORS `*`).
It is plain HTTP: if the site is ever served over HTTPS (CloudFront + certificate), browsers will block
those requests as mixed content — put the backend behind HTTPS first and update `src/app/services/http.service.ts`.

## Structure

- `src/app/three/` — the 3D studio: `studio-room.ts` (geometry, props, lights), `studio-scene.ts` (renderer, camera rig, input, slideshow), `studio.types.ts` (shared contract)
- `src/app/pages/experience/` — Angular overlay: dock navigation, hotspot labels, section panels, slideshow controls
- `src/app/services/http.service.ts` — backend access
