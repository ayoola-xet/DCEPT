# GlamProbe

GlamProbe finds compatibility differences between two Ethereum-compatible targets.

It runs the same declared scenario on a baseline target and a candidate target. It then writes a structured JSON report. A report contains both responses and each semantic difference.

GlamProbe helps teams test an Ethereum upgrade before they use it in production.

The Rust core and CLI are standalone. They do not need a database, wallet, login, Vercel account, session secret, encryption key, or Cloud configuration.

## No-login web workspace

The optional web application also has a public local-run page. It stores no
scenario, endpoint, response, or account data. It loads the Rust comparison
core as WebAssembly in the browser.

```sh
cd apps/web
npm install
npm run dev
```

Open `http://localhost:3000`. No `.env.local` file is required for the local-run
page. Load a YAML scenario. Then add two public RPC endpoints.

Browser mode sends requests from the browser. The endpoints must allow CORS.
It does not send endpoint credentials. Stateless Vercel mode sends requests
through `/api/public/run`. It accepts public HTTPS endpoints only. It does not
save run data. It limits each run to 20 actions. It blocks fuzzing and write RPC
methods. Use the local CLI for authenticated endpoints, fuzzing, or write tests.

## Current capabilities

- Read versioned YAML scenarios.
- Run any JSON-RPC method, including trace methods and `eth_sendRawTransaction`.
- Run HTTP checks for downstream tools and services.
- Use different parameters or request bodies for each target.
- Compare JSON values by path.
- Ignore unstable JSON fields.
- Apply absolute numeric tolerance to JSON numbers and Ethereum hex quantities.
- Write machine-readable JSON reports.
- Return exit code `2` when it finds a difference.

## Install

You need Rust 1.85 or later.

```sh
cargo install --path .
```

Or build and run directly from a fresh clone:

```sh
cargo build
./target/debug/glamprobe run scenario.yaml \
  --baseline https://baseline.example/rpc \
  --candidate https://candidate.example/rpc
```

Run `cargo install --path .` when you want to use `glamprobe run` without the `./target/debug/` path.

## Scenario format

Each scenario is a YAML document with `version: 1`, a name, and one or more actions.

```yaml
version: 1
name: latest-block
description: Compare the latest block response.
actions:
  - kind: rpc
    id: latest-block
    method: eth_getBlockByNumber
    params: ["latest", false]
    comparison:
      ignore_paths:
        - /result/hash
      numeric_tolerances:
        - path: /result/gasUsed
          absolute: 1000
```

`kind: rpc` sends a JSON-RPC request. The `method` field can contain any method that the targets support. This includes `eth_call`, `eth_estimateGas`, block and log methods, trace methods, and `eth_sendRawTransaction`.

Use `baseline_params` or `candidate_params` when an action needs different parameters on one target. This is useful for pre-signed transactions that have a target-specific chain ID or nonce.

`kind: http` sends an HTTP request to a path relative to each target URL. It supports shared and target-specific paths and JSON bodies.

```yaml
version: 1
name: indexer-health
actions:
  - kind: http
    id: health
    method: GET
    path: /health
    comparison:
      ignore_paths:
        - /body/checkedAt
```

Comparison paths use RFC 6901 JSON Pointer syntax. An empty path means the full response.

## Use the CLI

Validate a scenario without contacting a target.

```sh
glamprobe validate examples/transfer-to-fresh-address.yaml
```

Run a scenario.

```sh
glamprobe run examples/transfer-to-fresh-address.yaml \
  --baseline https://baseline.example/rpc \
  --candidate https://candidate.example/rpc \
  --output report.json
```

Pass a target header when an endpoint needs authentication.

```sh
glamprobe run scenario.yaml \
  --baseline https://baseline.example/rpc \
  --candidate https://candidate.example/rpc \
  --baseline-header 'Authorization: Bearer baseline-token' \
  --candidate-header 'Authorization: Bearer candidate-token'
```

The CLI prints the report to standard output. It exits with `0` when there are no findings, `2` when it finds differences, and `1` for a command error.

## Fuzzing and minimization

Add a `fuzz` block to vary values inside an RPC action's `params` field. GlamProbe uses a fixed seed, so it creates the same cases again when you use the same seed.

```yaml
fuzz:
  cases: 10
  seed: 42
  mutations:
    - action: estimate-transfer
      path: /0/value
      values: ["0x0", "0x1", "0x5208"]
```

Run the configured cases.

```sh
glamprobe fuzz examples/fuzz-estimate-gas.yaml \
  --baseline https://baseline.example/rpc \
  --candidate https://candidate.example/rpc
```

Use `--cases` and `--seed` to override the YAML values. The fuzz report records every applied mutation.

When a scenario has a finding, reduce it to the smallest action set that still fails.

```sh
glamprobe minimize scenario.yaml \
  --baseline https://baseline.example/rpc \
  --candidate https://candidate.example/rpc \
  --output reproducer.yaml
```

The minimizer reruns actions. Use fresh, disposable targets when the scenario can change target state.

## Transaction safety

GlamProbe does not store private keys and does not sign transactions. It can submit a pre-signed raw transaction when a scenario uses `eth_sendRawTransaction`.

An RPC target can change state when a scenario uses a write method. Use a dedicated test target. Do not give production endpoints to a scenario that sends transactions.

## Development

```sh
cargo fmt --check
cargo test
```

## Optional GlamProbe Cloud

`apps/web` contains the optional hosted dashboard and REST API. It depends on the standalone Rust product. It uses Sign-In with Ethereum (SIWE) for wallet authentication, Neon PostgreSQL for tenant data, and Vercel Workflow for durable runs.

Hosted scenarios also support the same `fuzz` block as the CLI. The workflow records the seed, each mutation, and each case report.

```sh
cd apps/web
cp .env.example .env.local
# Set DATABASE_URL, ENCRYPTION_KEY, and SESSION_SECRET.
npm install
psql "$DATABASE_URL" -f db/schema.sql
npm run build
```

Run `scripts/build-wasm.sh` when you update the Rust comparison core. The command creates the Cloud Node package at `apps/web/lib/wasm` and the browser package at `apps/web/public/wasm`.

See [apps/web/DEPLOYMENT.md](apps/web/DEPLOYMENT.md) for the production deployment procedure.

## CI and downstream adapters

Use the local GitHub Action from `actions/glamprobe` to run a scenario in a workflow. It writes a JSON report and adds one warning annotation for each difference.

`adapters` contains commands for ethers.js, viem, Foundry, and Hardhat. Use an adapter when you must test the same RPC operation through the downstream tool, not only through raw JSON-RPC.

## Hosted API tokens and quotas

Organization owners and administrators can create scoped API tokens at `POST /api/v1/tokens`. The token value is returned once. GlamProbe stores only its SHA-256 hash.

New organizations start with a limit of two concurrent runs, 10,000 monthly cases, and 1 GiB of artifact storage. An administrator can change these values in `organization_quotas`.

Hosted target endpoints must use HTTPS. GlamProbe rejects private, loopback, and link-local addresses. Store provider credentials in encrypted target headers, not in endpoint URLs.
