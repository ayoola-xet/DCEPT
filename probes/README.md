# Glamsterdam probe pack

This directory contains versioned Glamsterdam differential probes.

These files are the source of truth for the CLI, web host, and Cloud host. The
web build generates its probe index from `manifest.yaml` and these YAML files.

Each probe declares its default comparison mode in `manifest.yaml`.

For measured project leads and replay records, see
`../research/glamsterdam-impact-ledger.md`.

The gas repricing probe is an `upgrade_differential` probe. Run it under
pre-Glamsterdam and Glamsterdam rules from the same deterministic starting
state.

The Engine API, block access-list, malformed payload, and Builder API probes
are `client_differential` probes. Run both clients with the same protocol rules
and state.

The fork-boundary probe is a `control` probe. It verifies DCEPT with
intentionally different block parameters. It does not make a protocol
compatibility claim.

The CreateX deployment probe is a `control` probe. It compares the current
CreateX deployment transaction on Ethereum Mainnet and Platåberget. It checks
the fixed gas cap and the canonical factory address. It does not prove that
the observed difference comes only from protocol rules.

The PoW faucet probe is a `control` probe. It compares one transfer to an
existing account with one transfer to a fresh account on the same Platåberget
target. It reproduces the failure mode recorded for the devnet faucet's
100000-gas transaction cap. It does not make a client or upgrade claim.

## Included probes

- `engine-api-surface.yaml` checks Amsterdam Engine API capability support.
- `block-access-list-retrieval.yaml` compares the public EIP-7928 block access
  list for one fixed post-fork block.
- `gas-repricing-estimate.yaml` compares transfer and access-list gas estimates.
- `malformed-block-access-list.yaml` compares rejection of a known invalid
  `engine_newPayloadV5` fixture.
- `gloas-builder-status.yaml` checks the EIP-7732 Builder API status route.
- `gloas-execution-payload-bid.yaml` compares EIP-7732 execution payload bids.
- `fork-boundary-control.yaml` performs the live EIP-7928 product control.
- `createx-presigned-deployment.yaml` checks CreateX's fixed deployment gas
  cap and canonical address on Mainnet and Platåberget.
- `powfaucet-fresh-account-transfer.yaml` checks the 100000-gas faucet cap for
  existing and fresh recipients on Platåberget.

The public block access-list probe works with Platåberget's execution RPC. Use
the fixed block `0x233f6` for a reproducible public capability check.

Engine API probes need authenticated Engine API endpoints. Give the CLI each
target JWT header with `--baseline-header` and `--candidate-header`. Do not put
JWT values in a scenario file.

Gloas Builder API probes use Builder API target URLs, not execution RPC URLs.
The payload-bid probe needs a current slot, execution parent hash, beacon parent
root, and proposer public key from the same proposal context.

Use an official Glamsterdam fixture for `new_payload_params`. Select a case
that expects an `INVALID` payload status for the malformed block access-list
probe. Use `dcept fixture run` for a fixture case that expects a JSON-RPC
error code. Get the fixture from the selected `ethereum/execution-specs`
Glamsterdam test release. Pin the fixture release in your test record. The
devnet specification can change before mainnet.

## Use an official Engine API fixture

Download and extract the needed `blockchain_test_engine` JSON fixture from the
release pinned in `manifest.yaml`. DCEPT reads the fixture `params` array
directly. Do not edit the fixture payload.

```sh
dcept fixture inspect fixture.json
dcept fixture new-payload-v5-params fixture.json \
  --case missing_block_access_list \
  --output new-payload-params.json
```

Run the malformed block-access-list probe with the exported params:

```sh
dcept probe run glamsterdam/malformed-block-access-list \
  --baseline http://baseline-engine.example \
  --candidate http://candidate-engine.example \
  --baseline-header 'Authorization: Bearer BASELINE_JWT' \
  --candidate-header 'Authorization: Bearer CANDIDATE_JWT' \
  --var-file new_payload_params=new-payload-params.json
```

The fixture must match the genesis state and fork configuration of both targets.
DCEPT sends the selected Engine API directive. It does not create fixture
genesis state or start clients for you.

Run one complete fixture case with `dcept fixture run`. This command sends
each `engine_newPayloadV*` directive in order. It checks the expected `VALID`,
`INVALID`, or JSON-RPC error-code result on each target. Start each target with
the fixture network, genesis header, and pre-state first. DCEPT does not
start or configure the nodes. If the fixture includes a final head, DCEPT
sets it with `engine_forkchoiceUpdatedV*` and checks it through normal RPC.

## Run a probe

List available probes:

```sh
dcept probe list
```

Run the Engine API surface probe:

```sh
dcept probe run glamsterdam/engine-api-surface \
  --baseline http://baseline-engine.example \
  --candidate http://candidate-engine.example \
  --baseline-header 'Authorization: Bearer BASELINE_JWT' \
  --candidate-header 'Authorization: Bearer CANDIDATE_JWT'
```

Run the gas repricing probe against controlled pre-upgrade and post-upgrade targets:

```sh
dcept probe run glamsterdam/gas-repricing-estimate \
  --baseline https://baseline-rpc.example \
  --candidate https://candidate-rpc.example \
  --mode upgrade-differential \
  --baseline-protocol osaka \
  --candidate-protocol glamsterdam \
  --baseline-state-fingerprint sha256:STATE \
  --candidate-state-fingerprint sha256:STATE \
  --var sender=0x0000000000000000000000000000000000000001 \
  --var recipient=0x0000000000000000000000000000000000000002 \
  --var block=0x1234
```

Run the CreateX deployment compatibility probe. Download the creation bytecode
from the official CreateX repository first. Do not broadcast the transaction.

```sh
curl -fsSL https://raw.githubusercontent.com/pcaversaccio/createx/main/scripts/contract_creation_bytecode_createx.json \
  -o createx-init-code.json
dcept probe run glamsterdam/createx-presigned-deployment \
  --baseline https://ethereum-rpc.publicnode.com \
  --candidate https://rpc.plataberget.ethpandaops.io \
  --baseline-name ethereum-mainnet \
  --candidate-name plataberget \
  --mode control \
  --control-reason "Check CreateX fixed deployment gas and canonical address availability." \
  --var-file createx_init_code=createx-init-code.json \
  --output createx-plataberget-report.json
```

This run should show that Mainnet returns a gas estimate below the default
3,000,000 gas cap. Platåberget should return an out-of-gas error for that cap
and a larger estimate when the cap is raised. Treat the result as a current
network compatibility finding. Do not label it as a controlled upgrade
differential until both environments use equivalent starting state.

Run the live PoW faucet compatibility reproducer. Use the same Platåberget URL
for both targets. The control compares recipient state on purpose.

```sh
dcept probe run glamsterdam/powfaucet-fresh-account-transfer \
  --baseline https://rpc.plataberget.ethpandaops.io \
  --candidate https://rpc.plataberget.ethpandaops.io \
  --baseline-name existing-recipient \
  --candidate-name fresh-recipient \
  --mode control \
  --control-reason "Reproduce the devnet faucet 100000-gas cap for a fresh-account transfer."
```

The uncapped estimates should be about 21000 gas for the existing account and
about 200000 gas for the fresh account. The capped `eth_call` to the fresh
account should return an out-of-gas error. The exact estimate can change with
the target implementation. The report must remain a `control` result.

Inputs use `--var NAME=VALUE`. Pass arrays or objects as JSON. For example:

```sh
--var 'new_payload_params=[{"parentHash":"0x..."}]'
```
