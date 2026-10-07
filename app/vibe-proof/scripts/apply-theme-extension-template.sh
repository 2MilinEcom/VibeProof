#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-$APP_ROOT/extensions/vibeproof-reviews}"
SOURCE="$APP_ROOT/theme-extension-template"

if [ ! -d "$TARGET" ]; then
  echo "Theme extension not found at: $TARGET"
  echo
  echo "First run Shopify CLI from the app root:"
  echo "  shopify app generate extension"
  echo
  echo "Choose 'Theme app extension' and name it 'vibeproof-reviews'."
  echo "Then rerun:"
  echo "  bash scripts/apply-theme-extension-template.sh"
  exit 1
fi

mkdir -p "$TARGET/blocks" "$TARGET/assets"
cp "$SOURCE"/blocks/*.liquid "$TARGET/blocks/"
cp "$SOURCE"/assets/* "$TARGET/assets/"

echo "Applied VibeProof theme app extension files to:"
echo "  $TARGET"
