# EntryPoint v0.7 Level D queue

Status: 2026-09-04

Level C is complete for the recorded transaction. Level D is now complete for
the current Pimlico Alto source build. The result is `unsafe`.

The recorded evidence is in
[`entrypoint-v07-level-d.json`](entrypoint-v07-level-d.json).
The complete packed UserOperation is in
[`entrypoint-v07-user-operation.json`](entrypoint-v07-user-operation.json).

The fresh-signature recheck is also recorded in the evidence file. It signs
the unchanged operation with a disposable Anvil test key. A state override
maps the recorded signer permission to that key. The test does not override
policy code, signer code, paymaster code, account code, or EntryPoint code.
The Osaka node returns `0x` at the historical verification limit. The
Glamsterdam node returns `AA26 over verificationGasLimit`. This removes the
historical-signature caveat, but it is still not a no-override production
claim because the historical owner's private key is unavailable.

## What Level C found

The same EntryPoint v0.7 call uses the same twelve-account state in both local
Geth nodes.

- Osaka returns `0x`.
- The Glamsterdam build returns `AA26 over verificationGasLimit`.
- The first protocol-sensitive write is a Kernel `SSTORE` from zero to one.
- The write charges 97,920 state gas under the proposed schedule.

See [`entrypoint-v07-level-c.json`](entrypoint-v07-level-c.json) and
[`replay-entrypoint-v07.mjs`](../scripts/replay-entrypoint-v07.mjs).

## Bundlers to test

### Alchemy Rundler

Source commit: `ededc85af0a23580f24a038e7025b790d5dc6dbd`.

Rundler supports EntryPoint v0.7. Its documentation says that it estimates
`verificationGasLimit` with a binary search. The search calls the gas
measurement helper, then searches for the minimum gas value that passes
verification.

- [Rundler verification estimator](https://github.com/alchemyplatform/rundler/blob/ededc85af0a23580f24a038e7025b790d5dc6dbd/crates/contracts/contracts/v0_7/src/VerificationGasEstimationHelper.sol)
- [Rundler estimator design](https://github.com/alchemyplatform/rundler/blob/ededc85af0a23580f24a038e7025b790d5dc6dbd/docs/architecture/rpc.md#verificationgaslimit-estimation)

The scan found no explicit EIP-8037 state-gas calculation in the estimator.
The node simulation may still observe the new schedule. Run the test before
calling this a defect.

### Pimlico Alto

Source commit: `093f2993902016ddbed02ac557f88c6127cc85d1`.

Alto's v0.7 estimator calls its simulation contract. If the first result is
out of gas, it runs `binarySearchVerificationGas` and returns the measured gas.
The default v0.7 verification multiplier is 130 percent.

- [Alto v0.7 gas estimator](https://github.com/pimlicolabs/alto/blob/093f2993902016ddbed02ac557f88c6127cc85d1/src/rpc/estimation/gasEstimations07.ts)
- [Alto estimator RPC method](https://github.com/pimlicolabs/alto/blob/093f2993902016ddbed02ac557f88c6127cc85d1/src/rpc/methods/eth_estimateUserOperationGas.ts)
- [Alto gas multiplier defaults](https://github.com/pimlicolabs/alto/blob/093f2993902016ddbed02ac557f88c6127cc85d1/src/cli/config/options.ts)

The scan found no explicit EIP-8037 state-gas calculation in the estimator.
The controlled run now shows an unsafe result.

Alto returned these values for the same UserOperation on the two fork rules:

| Fork rule | Returned `verificationGasLimit` | Decimal |
| --- | ---: | ---: |
| Osaka | `0x2cb2c` | 183,084 |
| Glamsterdam | `0x280c9` | 164,041 |

The candidate EntryPoint rejected Alto's Glamsterdam value with
`AA26 over verificationGasLimit`. A signature-independent gas check rejected
the value even when the policy, signer, and paymaster code did no work. The
candidate gas guard passed only between `0x42ff0` (274,416, still `AA26`) and
`0x4302c` (274,476, then `AA24`). This makes 274,476 a lower bound for this
gas path. The returned 164,041 is at least 110,435 gas below that lower bound.

The code overrides are a measurement control. They do not change account
storage, account bytecode, EntryPoint bytecode, fork rules, or the state root.
They prevent the changed UserOperation hash from stopping the test at
signature validation. `AA24` means the gas guard passed and the deliberate
invalid signature was the next result. `AA26` means the gas guard failed
first. This method gives a conservative lower bound, not a replacement for a
newly signed UserOperation.

## Level D test

1. Start the recorded replay. Keep the Osaka and Glamsterdam RPC URLs.
2. Decode the historical `handleOps` calldata into its single Packed UserOperation.
3. Start one Rundler instance or one Alto instance against each RPC.
4. Send `eth_estimateUserOperationGas` to both bundler instances.
5. Record the returned `verificationGasLimit`, `callGasLimit`, and paymaster gas limits.
6. Re-run the operation with the returned limits in each controlled node.
7. Check whether the bundler returns a candidate limit that passes EntryPoint.
8. Mark Level D only when the bundler or SDK itself accepts, emits, or submits a
   result that fails under the candidate rules.

Use a newly signed test operation when changing gas fields. A historical
signature may cover the original gas fields and cannot be changed safely.

## Result labels

Use one of these labels:

- `adapted`: the candidate estimator increases or changes the limit and the
  resulting operation passes;
- `rejected`: the candidate estimator rejects the operation with a clear
  validation error;
- `unsafe`: the estimator returns a result that EntryPoint rejects under the
  same candidate rules;
- `inconclusive`: the test cannot prove that the bundler saw equivalent state.

Only `unsafe` is a Level D compatibility finding. `adapted` is still useful:
it shows that the bundler already responds to the changed protocol behavior.

## Recorded Alto result

The test used the same parent state root in both local Geth nodes:
`0x5294253f08cc8c5ab5b32c2267c37a3c081dea5a17febed1d09a2c46440f14d0`.

The current Alto source commit was
`093f2993902016ddbed02ac557f88c6127cc85d1`. Alto ran against the Osaka RPC
on port `3101` and the Glamsterdam RPC on port `3102`.

The candidate estimator result was:

```json
{
  "preVerificationGas": "0xcd01",
  "verificationGasLimit": "0x280c9",
  "callGasLimit": "0x78fb",
  "paymasterVerificationGasLimit": "0x9d46",
  "paymasterPostOpGasLimit": "0x1"
}
```

The same candidate limits failed the candidate EntryPoint gas guard with
`AA26 over verificationGasLimit`. The Osaka result reached `AA24 signature
error` after the gas guard, so the Osaka value did not show the same failure.

This is a current estimator finding for this controlled operation. It is not a
claim that all Alto operations fail. It is not a claim about Rundler. Run the
Rundler test before making a cross-bundler statement.

## Fresh-signature recheck

The fresh-signature recheck uses the exact UserOperation in
[`entrypoint-v07-user-operation.json`](entrypoint-v07-user-operation.json),
with its original gas fields. It signs the EIP-4337 UserOperation hash with
the Anvil default test key and prefixes the signature with the historical
Kernel mode byte `0xff`.

The signer module stores the historical owner in a permission mapping. The
replay supplies a temporary state override for that one mapping value. This
lets the signer verify the new signature while preserving the rest of the
recorded state. The test result is:

| Fork rule | EntryPoint result at `0x3aa6a` |
| --- | --- |
| Osaka | `0x` |
| Glamsterdam | `AA26 over verificationGasLimit` |

Alto also returns the same estimates for the fresh-signed operation:
`0x2cb2c` on Osaka and `0x280c9` on Glamsterdam. This is stronger evidence
than the code-stub gas guard. It is still a controlled replay, not a live
funded submission.
