#!/usr/bin/env bash
# Upload the production build to the S3 static website bucket.
# Usage: ./scripts/deploy.sh [bucket] [region]
set -euo pipefail

BUCKET="${1:-patrickdandernos.fr}"
REGION="${2:-eu-west-3}"
DIST="dist/patrick-dandernos-ng"

if [ ! -f "$DIST/index.html" ]; then
  echo "No build found in $DIST — run 'npm run build' first." >&2
  exit 1
fi

# Everything except index.html: content-hashed or rarely changing -> cache for a year.
aws s3 sync "$DIST" "s3://$BUCKET" --region "$REGION" --delete \
  --exclude "index.html" \
  --cache-control "public, max-age=31536000, immutable"

# Entry point: always revalidate so a new release is live immediately.
aws s3 cp "$DIST/index.html" "s3://$BUCKET/index.html" --region "$REGION" \
  --cache-control "no-cache" --content-type "text/html; charset=utf-8"

echo "Deployed to s3://$BUCKET"
