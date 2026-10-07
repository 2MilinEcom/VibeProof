#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_ROOT"

echo "== VibeProof prelaunch =="
echo "1/6 Prisma schema"
npx prisma validate

echo "2/6 Prisma client"
npx prisma generate

echo "3/6 Database migrations"
npx prisma migrate deploy

echo "4/6 TypeScript"
npm run typecheck

echo "5/6 Shopify configuration"
shopify app config validate --json

echo "6/6 Shopify build + Theme Check"
shopify app build

echo
echo "VibeProof prelaunch checks passed."
