# GlamProbe

GlamProbe finds compatibility differences between two Ethereum-compatible targets.

It runs the same declared scenario on a baseline target and a candidate target. It then writes a structured JSON report. A report contains both responses and each semantic difference.

GlamProbe helps teams test an Ethereum upgrade before they use it in production.

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
  --baseline-url https://baseline.example/rpc \
  --candidate-url https://candidate.example/rpc \
  --output report.json
```

Pass a target header when an endpoint needs authentication.

```sh
glamprobe run scenario.yaml \
  --baseline-url https://baseline.example/rpc \
  --candidate-url https://candidate.example/rpc \
  --baseline-header 'Authorization: Bearer baseline-token' \
  --candidate-header 'Authorization: Bearer candidate-token'
```

The CLI prints the report to standard output. It exits with `0` when there are no findings, `2` when it finds differences, and `1` for a command error.

## Transaction safety

GlamProbe does not store private keys and does not sign transactions. It can submit a pre-signed raw transaction when a scenario uses `eth_sendRawTransaction`.

An RPC target can change state when a scenario uses a write method. Use a dedicated test target. Do not give production endpoints to a scenario that sends transactions.

## Development

```sh
cargo fmt --check
cargo test
```
