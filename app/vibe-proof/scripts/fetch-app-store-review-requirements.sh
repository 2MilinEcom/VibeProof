#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_ROOT"

shopify doc fetch   --url https://shopify.dev/docs/apps/launch/app-store-review/app-store-ai-self-review-requirements   --output docs/app-store-review-requirements.md

echo "Fetched the current Shopify App Store self-review requirements to docs/app-store-review-requirements.md"
