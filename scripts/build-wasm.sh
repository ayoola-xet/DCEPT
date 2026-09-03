#!/usr/bin/env sh
set -eu

wasm-pack build --target nodejs --release --out-dir apps/web/lib/wasm -- --features wasm
