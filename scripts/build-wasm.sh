#!/usr/bin/env sh
set -eu

wasm-pack build --target nodejs --release --out-dir apps/web/lib/wasm -- --features wasm
wasm-pack build --target web --release --out-dir apps/web/public/wasm -- --features wasm
node scripts/finalize-wasm-packages.mjs
