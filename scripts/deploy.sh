#!/usr/bin/env bash
# Upload the production build to the S3 static website bucket, backing up the live site first.
#
# Usage:
#   ./scripts/deploy.sh [bucket] [region]                  back up the live site, then deploy dist/
#   ./scripts/deploy.sh --no-backup [bucket] [region]      deploy without the backup step
#   ./scripts/deploy.sh --restore [dir] [bucket] [region]  put a backup back online (default: the latest one)
#
# Backups are plain copies of the bucket, stored in .deploy-backups/<timestamp>/ (ignored by git, last 5 kept).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist/patrick-dandernos-ng"
BACKUPS="$ROOT/.deploy-backups"
KEEP=5

MODE="deploy"
BACKUP=1
RESTORE_DIR=""
POSITIONAL=()

while [ $# -gt 0 ]; do
  case "$1" in
    --restore)
      MODE="restore"
      # optional directory right after the flag
      if [ $# -gt 1 ] && [ -d "$2" ]; then
        RESTORE_DIR="$2"
        shift
      fi
      ;;
    --no-backup) BACKUP=0 ;;
    -h | --help)
      sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) POSITIONAL+=("$1") ;;
  esac
  shift
done

BUCKET="${POSITIONAL[0]:-patrickdandernos.fr}"
REGION="${POSITIONAL[1]:-eu-west-3}"

# Push a local directory to the bucket with the right cache headers.
publish() {
  local src="$1"

  # Everything except index.html: content-hashed or rarely changing -> cache for a year.
  aws s3 sync "$src" "s3://$BUCKET" --region "$REGION" --delete \
    --exclude "index.html" \
    --cache-control "public, max-age=31536000, immutable"

  # Entry point: always revalidate so a new release is live immediately.
  aws s3 cp "$src/index.html" "s3://$BUCKET/index.html" --region "$REGION" \
    --cache-control "no-cache" --content-type "text/html; charset=utf-8"
}

latest_backup() {
  ls -1d "$BACKUPS"/*/ 2>/dev/null | sort | tail -n 1 | sed 's:/$::' || true
}

prune_backups() {
  local count
  count=$(ls -1d "$BACKUPS"/*/ 2>/dev/null | wc -l | tr -d ' ' || true)
  while [ "$count" -gt "$KEEP" ]; do
    rm -rf "$(ls -1d "$BACKUPS"/*/ | sort | head -n 1)"
    count=$((count - 1))
  done
}

if [ "$MODE" = "restore" ]; then
  RESTORE_DIR="${RESTORE_DIR:-$(latest_backup)}"
  if [ -z "$RESTORE_DIR" ] || [ ! -f "$RESTORE_DIR/index.html" ]; then
    echo "No usable backup found (looked in $BACKUPS). Pass a directory: --restore <dir>" >&2
    exit 1
  fi
  echo "About to REPLACE s3://$BUCKET with the backup: $RESTORE_DIR"
  read -r -p "Continue? [y/N] " answer
  case "$answer" in
    y | Y | yes) ;;
    *) echo "Cancelled."; exit 1 ;;
  esac
  publish "$RESTORE_DIR"
  echo "Restored s3://$BUCKET from $RESTORE_DIR"
  exit 0
fi

if [ ! -f "$DIST/index.html" ]; then
  echo "No build found in $DIST — run 'npm run build' first." >&2
  exit 1
fi

if [ "$BACKUP" -eq 1 ]; then
  STAMP="$(date +%Y%m%d-%H%M%S)"
  TARGET="$BACKUPS/$STAMP"
  mkdir -p "$TARGET"
  echo "Backing up s3://$BUCKET -> $TARGET"
  aws s3 sync "s3://$BUCKET" "$TARGET" --region "$REGION" --only-show-errors
  if [ ! -f "$TARGET/index.html" ]; then
    # first deploy or empty bucket: nothing worth keeping, and a restore would have nothing to restore
    echo "Nothing to back up (no index.html in the bucket)." >&2
    rm -rf "$TARGET"
  else
    prune_backups
    echo "Backup saved. To roll back later: ./scripts/deploy.sh --restore"
  fi
fi

publish "$DIST"
echo "Deployed to s3://$BUCKET"
