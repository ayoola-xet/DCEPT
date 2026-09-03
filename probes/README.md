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

Engine API probes need authenticated Engine API endpoints. Give the CLI each
target JWT header with `--baseline-header` and `--candidate-header`. Do not put
JWT values in a scenario file.

Use an official Glamsterdam fixture for `new_payload_params`. Get the fixture
from the selected `ethereum/execution-specs` Glamsterdam test release. Pin the
fixture release in your test record. The devnet specification can change before
mainnet.

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
