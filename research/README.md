# DCEPT research workflow

The [Glamsterdam impact ledger](glamsterdam-impact-ledger.md) contains the
ranked project leads and their evidence. The ledger uses two proof levels:

- `A+B`: the official impact data shows the pattern and current source has a
  matching code path;
- `C`: DCEPT reproduces the difference with equivalent state under two fork
  rules.

Do not publish a project break before level C. Add level D only when the
project's own estimator, bundler, solver, or SDK changes its result.

## Replay one historical transaction

Use `transaction-replay.yaml` for a read-only replay. The template sends the
same `eth_call` to both targets. It keeps the original sender, target,
calldata, gas limit, value, access list, and block context.

Fetch the transaction from an Ethereum RPC. Do not broadcast it.

Run the template against two local fork environments:

```sh
dcept run research/transaction-replay.yaml \
  --baseline http://127.0.0.1:8545 \
  --candidate http://127.0.0.1:8546 \
  --mode upgrade-differential \
  --baseline-protocol osaka \
  --candidate-protocol glamsterdam \
  --baseline-state-fingerprint sha256:STATE \
  --candidate-state-fingerprint sha256:STATE \
  --var sender=0x0000000000000000000000000000000000000000 \
  --var target=0x0000000000000000000000000000000000000000 \
  --var calldata=0x \
  --var gas=0x5208 \
  --var value=0x0 \
  --var 'access_list=[]' \
  --var block=0x1 \
  --output research/replay-report.json
```

Replace every placeholder with values from the selected transaction. Use the
same block number in both environments. The two environments must start from
the same state fingerprint.

For EntryPoint, Kernel, Alchemy, Across, Socket, CoW, and 0x, use the sample
hashes in the ledger. The transaction calldata is not shortened in the ledger;
fetch the complete `input` field from the RPC.

## Record a result

Add the report path, source commit, fork client versions, state fingerprint,
and first changed operation to the ledger or the linked issue. Mark the entry
`C` only when the state fingerprints match and the trace shows the protocol
rule as the cause. Mark the entry `D` only when the project-level behavior also
changes.

If state equivalence is not verified, mark the result `inconclusive` or
`uncontrolled_state`. Do not call it a protocol regression.

## Run the recorded EntryPoint Level C replay

This replay uses the EntryPoint v0.7 transaction recorded in the ledger. It
fetches the transaction and its pre-state with `debug_traceTransaction`, then
starts two local Geth nodes with the same state.

Build DCEPT and run the replay:

```sh
cargo build
node scripts/replay-entrypoint-v07.mjs \
  --output research/entrypoint-v07-replay-report.json
```

The default archive RPC is `https://eth.drpc.org`. Use another archive RPC
when required:

```sh
DCEPT_ARCHIVE_RPC=https://archive.example/rpc \
  node scripts/replay-entrypoint-v07.mjs
```

The archive RPC must support `eth_getTransactionByHash`,
`eth_getBlockByNumber`, and Geth's `debug_traceTransaction` with
`prestateTracer`. Docker must be running. The script does not broadcast the
historical transaction.

Expected result:

```text
Osaka       -> 0x
Glamsterdam -> JSON-RPC error 3 / AA26 over verificationGasLimit
```

The script verifies matching state roots and equivalent DCEPT request plans.
It exits with an error if the result does not match this recorded case.

## Continue to the bundler test

Level C proves the protocol behavior change. Level D must test the software
that builds or estimates the UserOperation. The current Rundler and Alto source
paths, plus the exact test procedure, are in
[`entrypoint-v07-level-d-queue.md`](entrypoint-v07-level-d-queue.md).

The Level D case includes the complete packed UserOperation in
[`entrypoint-v07-user-operation.json`](entrypoint-v07-user-operation.json).
