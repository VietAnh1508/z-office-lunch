#!/usr/bin/env bash
# Full local dev bring-up: container runtime -> Postgres -> env file -> build -> wrangler dev.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

source scripts/dev-setup.sh

echo "==> Building web..."
pnpm --filter web build

echo "==> Starting wrangler dev (http://localhost:8787)..."
exec pnpm --filter api dev
