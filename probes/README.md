# Glamsterdam probe pack

This directory contains versioned Glamsterdam differential probes.

Each probe compares two execution targets that use the same chain state. A
baseline target and candidate target must run the same Glamsterdam devnet or
testnet. Do not compare unrelated networks.

## Included probes

- `engine-api-surface.yaml` checks Amsterdam Engine API capability support.
- `block-access-list-retrieval.yaml` compares the `blockAccessList` data in a
  post-fork payload body.
- `gas-repricing-estimate.yaml` compares transfer and access-list gas estimates.
- `malformed-block-access-list.yaml` compares rejection of a known invalid
  `engine_newPayloadV5` fixture.
- `gloas-builder-status.yaml` checks the EIP-7732 Builder API status route.
- `gloas-execution-payload-bid.yaml` compares EIP-7732 execution payload bids.

Engine API probes need authenticated Engine API endpoints. Give the CLI each
target JWT header with `--baseline-header` and `--candidate-header`. Do not put
JWT values in a scenario file.

Gloas Builder API probes use Builder API target URLs, not execution RPC URLs.
The payload-bid probe needs a current slot, execution parent hash, beacon parent
root, and proposer public key from the same proposal context.

Use an official Glamsterdam fixture for `new_payload_params`. Select a case
that expects an `INVALID` payload status for the malformed block access-list
probe. Use `glamprobe fixture run` for a fixture case that expects a JSON-RPC
error code. Get the fixture from the selected `ethereum/execution-specs`
Glamsterdam test release. Pin the fixture release in your test record. The
devnet specification can change before mainnet.

## Use an official Engine API fixture

Download and extract the needed `blockchain_test_engine` JSON fixture from the
release pinned in `manifest.yaml`. GlamProbe reads the fixture `params` array
directly. Do not edit the fixture payload.

```sh
glamprobe fixture inspect fixture.json
glamprobe fixture new-payload-v5-params fixture.json \
  --case missing_block_access_list \
  --output new-payload-params.json
```

Run the malformed block-access-list probe with the exported params:

```sh
glamprobe probe run glamsterdam/malformed-block-access-list \
  --baseline http://baseline-engine.example \
  --candidate http://candidate-engine.example \
  --baseline-header 'Authorization: Bearer BASELINE_JWT' \
  --candidate-header 'Authorization: Bearer CANDIDATE_JWT' \
  --var-file new_payload_params=new-payload-params.json
```

The fixture must match the genesis state and fork configuration of both targets.
GlamProbe sends the selected Engine API directive. It does not create fixture
genesis state or start clients for you.

Run one complete fixture case with `glamprobe fixture run`. This command sends
each `engine_newPayloadV*` directive in order. It checks the expected `VALID`,
`INVALID`, or JSON-RPC error-code result on each target. Start each target with
the fixture network, genesis header, and pre-state first. GlamProbe does not
start or configure the nodes. If the fixture includes a final head, GlamProbe
sets it with `engine_forkchoiceUpdatedV*` and checks it through normal RPC.

## Run a probe

List available probes:

```sh
glamprobe probe list
```

Run the Engine API surface probe:

```sh
glamprobe probe run glamsterdam/engine-api-surface \
  --baseline http://baseline-engine.example \
  --candidate http://candidate-engine.example \
  --baseline-header 'Authorization: Bearer BASELINE_JWT' \
  --candidate-header 'Authorization: Bearer CANDIDATE_JWT'
```

Run the gas repricing probe against state-aligned public RPC targets:

```sh
glamprobe probe run glamsterdam/gas-repricing-estimate \
  --baseline https://baseline-rpc.example \
  --candidate https://candidate-rpc.example \
  --var sender=0x0000000000000000000000000000000000000001 \
  --var recipient=0x0000000000000000000000000000000000000002 \
  --var block=0x1234
```

Inputs use `--var NAME=VALUE`. Pass arrays or objects as JSON. For example:

```sh
--var 'new_payload_params=[{"parentHash":"0x..."}]'
```
