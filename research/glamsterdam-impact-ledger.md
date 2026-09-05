# DCEPT Glamsterdam impact ledger

Status: 2026-09-03

This ledger records real projects that may break when the Glamsterdam gas rules
take effect. It keeps the evidence, the suspected code path, the impact, and
the next DCEPT test in one place.

## Read this before using the results

These entries are measured compatibility leads. They are not confirmed bugs.

The official Ethereum repricing report is the main impact source. The report
was regenerated on 2026-08-24 from a four-million-block window from
2024-12-03 to 2026-06-15. Its G4 class means that a transaction succeeded with
the current schedule, failed with the proposed schedule, and did not succeed
when the gas limit was increased. See the
[impact report at snapshot `67310335af1992c147264a1cde8becd118dd44b8`](https://github.com/ethereum/repricing-impact/blob/67310335af1992c147264a1cde8becd118dd44b8/site/entity-report.md).

The report is a screening data set. It does not prove that every listed
transaction will fail on every deployment. It also does not prove that the
listed project caused the failure. We must verify the deployed bytecode, the
proxy implementation, and the complete call path.

Both [EIP-8037](https://eips.ethereum.org/EIPS/eip-8037) and
[EIP-8038](https://eips.ethereum.org/EIPS/eip-8038) are still marked `Review`.
The numbers in this ledger describe those draft schedules. They are not a
prediction of the final mainnet schedule.

### Evidence levels

| Level | Meaning |
| --- | --- |
| A | The official impact data measures the pattern. |
| B | Current project source contains a matching code path. |
| C | DCEPT replays the same logical case in controlled pre- and post-fork environments. |
| D | The project accepts the replay and changes its own result, estimate, or transaction handling. |

All entries in this document have level A. The entries marked `A+B` also have
a source mapping. EntryPoint v0.7 now has level C. The other entries still
need a controlled replay. A launch claim about a project needs level D.

### Severity scale

Severity is a DCEPT triage rating. It is not a security rating.

- **Critical:** The change can block account operations, bridge settlement, or
  another operation that can prevent access to funds.
- **High:** The change can block a material share of production operations or
  require an urgent integration change.

For every upgrade test, use `comparison_mode: upgrade_differential`. Set
`state_equivalence_status: verified` before making a protocol claim. A live
Mainnet-versus-testnet run is not a controlled upgrade differential.

## Ranked replay order

The order balances measured impact, code-path clarity, and the chance of a
clean controlled replay.

| Rank | Target | Rule | Measured lead | Report priority | DCEPT severity | Status | First replay |
| ---: | --- | --- | ---: | --- | --- | --- | --- |
| 1 | [eth-infinitism account-abstraction](https://github.com/eth-infinitism/account-abstraction) EntryPoint v0.7 | EIP-8037 | 834,298 G4 EntryPoint rows; about 150,415 fresh deployments marked out of gas | High | Critical | `A+B+C+D (Alto unsafe)` | Test Rundler with the same controlled operation. |
| 2 | [ZeroDev Kernel](https://github.com/zerodevapp/kernel) | EIP-8037 | 252,574 Kernel rows: 126,266 out of gas and 126,308 reverts | High | Critical | `A+B` | Replay first-use Kernel installation and nonce writes through `handleOps`. |
| 3 | [Across SpokePool](https://github.com/across-protocol/contracts) | EIP-8037 | 67,321 rows on the Ethereum SpokePool; 102,653 across the reported pools | High | Critical | `A+B` | Replay `fillRelay` and the exact nested transfer path. |
| 4 | [Socket contracts](https://github.com/SocketDotTech/bungee-contracts-public) / reported SocketBatcher | EIP-8037 | 16,717 G4 rows; about 18.90% of 88,463 observed transactions | High | High | `A+B*` | Verify the deployed code identity, then replay the batch route. |
| 5 | [CoW Protocol GPv2Settlement](https://github.com/cowprotocol/contracts) | EIP-8037 | 105,390 rows; 105,388 out of gas; 6.71% of 1,569,513 observed transactions | High | High | `A+B` | Replay a settlement batch with the same token and order state. |
| 6 | [Alchemy Modular Account](https://github.com/alchemyplatform/modular-account) | EIP-8037 and EIP-8038 | 54,004 rows across the two schedules; 12,023 EIP-8037 halts and 29,958 EIP-8038 reverts | Medium | High | `A+B` | Replay first-use account validation through EntryPoint v0.7. |
| 7 | [0x Settler](https://github.com/0xProject/0x-settler) | EIP-8038 | 11,708 revert rows; 2,819 in the measured `EXTCODESIZE` cluster | High | High | `A+B` | Run a separate EIP-8038 cold-access and `EXTCODESIZE` replay. |

`*` The report names an address called `SocketBatcher`. The current public
repository uses `SocketGateway` and route modules. Confirm that the deployed
address and source commit refer to the same code before attribution.

The machine-readable evidence is in the report repository:

- [EntryPoint data](https://github.com/ethereum/repricing-impact/blob/67310335af1992c147264a1cde8becd118dd44b8/site/data/eip-8037/affected/0x0000000071727de22e5e9d8baf0edac6f37da032.json)
- [Kernel data](https://github.com/ethereum/repricing-impact/blob/67310335af1992c147264a1cde8becd118dd44b8/site/data/eip-8037/affected/0xbac849bb641841b44e965fb01a4bf5f074f84b4d.json)
- [Across data](https://github.com/ethereum/repricing-impact/blob/67310335af1992c147264a1cde8becd118dd44b8/site/data/eip-8037/affected/0x5e5b726c81f43b953a62ad87e2835c85c4d9dd3b.json)
- [Socket data](https://github.com/ethereum/repricing-impact/blob/67310335af1992c147264a1cde8becd118dd44b8/site/data/eip-8037/affected/0x87be3fc3edfe10cb8ce1244d6a1969fc55f9f83c.json)
- [CoW data](https://github.com/ethereum/repricing-impact/blob/67310335af1992c147264a1cde8becd118dd44b8/site/data/eip-8037/affected/0x9008d19f58aabd9ed0d60971565aa8510560ab41.json)
- [Alchemy EIP-8037 data](https://github.com/ethereum/repricing-impact/blob/67310335af1992c147264a1cde8becd118dd44b8/site/data/eip-8037/affected/0x000000000000c5a9089039570dd36455b5c07383.json)
- [Alchemy EIP-8038 data](https://github.com/ethereum/repricing-impact/blob/67310335af1992c147264a1cde8becd118dd44b8/site/data/eip-8038/affected/0x000000000000c5a9089039570dd36455b5c07383.json)
- [0x data](https://github.com/ethereum/repricing-impact/blob/67310335af1992c147264a1cde8becd118dd44b8/site/data/eip-8038/affected/0xbbbbbbbbbb9cc5e90e3b3af64bdaf62c37eeffcb.json)

## 1. EntryPoint v0.7

**Severity:** Critical
**Proof status:** `A+B+C+D`; Alto result `unsafe`
**Rule:** [EIP-8037](https://eips.ethereum.org/EIPS/eip-8037)
**Deployment:** `0x0000000071727de22e5e9d8baf0edac6f37da032`
**Entry selector:** `0x765e827f` (`handleOps`)

### Evidence

The official data records 834,298 G4 EntryPoint rows for v0.7. It records
336,062 out-of-gas rows and 498,236 non-out-of-gas rows. The report also marks
about 150,415 fresh wallet deployments as out of gas under EIP-8037. It reports
that increasing the transaction gas limit does not rescue the measured guard
and accounting failures.

Example measured transaction:

| Field | Value |
| --- | --- |
| Hash | `0x5e0e38047dfa6fce58548a2f0b402bc3faccf4e7a3d5860f5b3c83796052ad66` |
| Block | `21,349,727` |
| From | `0x4337001fff419768e088ce247456c1b892888084` |
| To | EntryPoint v0.7 above |
| Gas limit | `0xc06b5` (788,149) |
| Calldata | 1,252 bytes; starts with `0x765e827f` |

The report's top non-out-of-gas cluster uses the `handleOps` selector. Its
measured gas delta has a median of `-49,720`. A separate cluster reaches the
ZeroDev Kernel and fails on `SSTORE` with no state-gas reservoir.

### Current source path

The source was checked at commit
`1c6b669d0eea734e09a87e095ba15e076151718a` on the `develop` branch:

- [`handleOps` validation and execution](https://github.com/eth-infinitism/account-abstraction/blob/1c6b669d0eea734e09a87e095ba15e076151718a/contracts/core/EntryPoint.sol#L78-L110)
- [`innerHandleOp` gas guard and call](https://github.com/eth-infinitism/account-abstraction/blob/1c6b669d0eea734e09a87e095ba15e076151718a/contracts/core/EntryPoint.sol#L403-L435)
- [EntryPoint v0.7 validation guard](https://github.com/eth-infinitism/account-abstraction/blob/v0.7.0/contracts/core/EntryPoint.sol#L616-L660)
- `innerHandleOp` records gas before user execution, reads the user operation
  gas limit, and checks the 63/64 forwarding guard.
- The same path accounts for post-operation gas and can revert when the
  measured gas no longer fits the fixed guard.

### What can break

EIP-8037 adds a separate state-gas cost. A user operation that creates an
account or writes a previously untouched slot can consume state gas before the
normal execution gas is complete. EntryPoint can then reject the operation in
its forwarding or post-operation accounting path. A bundler can report a
failed user operation even when the caller raises the normal transaction gas
limit.

### DCEPT replay

1. Use the exact transaction calldata, `from`, gas limit, and access list from
   the sample transaction.
2. Run `debug_traceCall` at the sample block on a controlled Osaka node and a
   controlled Glamsterdam node.
3. Use the same genesis state and the same block context in both nodes.
4. Compare the `handleOps` result, the revert data, and the first state write.
5. Run the same case through the bundler or SDK that created the operation.

Do not use an unrelated Mainnet block as the candidate state. That would only
show a state difference.

### Level C result: reproduced on 2026-09-03

DCEPT independently reproduced the EntryPoint result with a twelve-account
pre-state extracted by the Geth `prestateTracer`. The two local nodes use the
same alloc, block context, client image, and transaction. Only the Amsterdam
fork timestamp differs.

| Field | Baseline | Candidate |
| --- | --- | --- |
| Protocol | Osaka | Glamsterdam |
| State root | `0x5294253f08cc8c5ab5b32c2267c37a3c081dea5a17febed1d09a2c46440f14d0` | Same |
| Request | `eth_call` with the exact transaction input | Same request |
| Result | `0x` | JSON-RPC error code `3`; revert data starts `0x220266b6` |
| Decoded effect | `handleOps` completes | EntryPoint returns `AA26 over verificationGasLimit` |

The replay used the pinned image
`ethpandaops/geth:glamsterdam-devnet-8@sha256:50fad280c7e2a2d7df835b46753c7633882824fbf545efb63c03451f910090e8`.
The original transaction is
`0x5e0e38047dfa6fce58548a2f0b402bc3faccf4e7a3d5860f5b3c83796052ad66` at
block `21,349,727`. The parent state is block `21,349,726`.

The first UserOperation sender is the proxy
`0xa7ba82f49f3065a0c3f3d5f73d13b90114c37fc7`. Its implementation is
`0x94f097e1ebeb4eca3aae54cabb08905b239a7d27`, which is verified as a ZeroDev
Kernel implementation. The [current Kernel source](https://github.com/zerodevapp/kernel/blob/f2a84a332ec5a722e7e95a0d64601905c3c87fe9/src/Kernel.sol)
contains the `validateUserOp` path. The trace reaches the implementation at
call depth 3.

The first protocol-sensitive state write is a Kernel `SSTORE` at call depth 3.
The slot changes from zero to one. Osaka charges 20,000 execution gas. The
Glamsterdam build charges 10,100 execution gas plus 97,920 state gas
(`64 bytes x CPSB 1530`), for an effective 108,020-gas charge. The account
validation call uses 110,346 gas under Osaka and 199,966 gas under
Glamsterdam. EntryPoint's fixed 240,234 `verificationGasLimit` then fails its
`AA26` guard.

The DCEPT report records `comparison_mode: upgrade_differential`,
`state_equivalence_status: verified`, `requests_equivalent: true`, and
`definitive_compatibility_claim: true`. This proves a controlled
pre-Glamsterdam to Glamsterdam behavior change for this exact EntryPoint
execution. It does not prove that every UserOperation fails.

The compact proof record is
[`entrypoint-v07-level-c.json`](entrypoint-v07-level-c.json). The replay
command is [`replay-entrypoint-v07.mjs`](../scripts/replay-entrypoint-v07.mjs).

### Level D result: Pimlico Alto is unsafe on the candidate fork

The current Alto source build at commit
`093f2993902016ddbed02ac557f88c6127cc85d1` estimated the same UserOperation
against both controlled nodes. It returned `0x280c9` (164,041) for
`verificationGasLimit` on Glamsterdam and `0x2cb2c` (183,084) on Osaka.

The candidate EntryPoint rejected the candidate estimate with
`AA26 over verificationGasLimit`. A gas-only check replaced the two permission
policies, the signer, and the paymaster with deterministic return stubs. It
left the account storage, account bytecode, EntryPoint bytecode, state root,
and fork rules unchanged. The candidate gas guard still failed at `0x280c9`.
It passed only between `0x42ff0` (274,416, `AA26`) and `0x4302c` (274,476,
`AA24`). This gives a conservative lower bound for the candidate gas path.

The Level D record is
[`entrypoint-v07-level-d.json`](entrypoint-v07-level-d.json). The full method,
including the signature limitation and the state-override control, is in
[`entrypoint-v07-level-d-queue.md`](entrypoint-v07-level-d-queue.md). This is
a current Alto estimator finding for the recorded operation. It does not prove
that all Alto operations fail. It does not prove a Rundler defect.

## 2. ZeroDev Kernel

**Severity:** Critical
**Proof status:** `A+B`; controlled replay pending
**Rule:** [EIP-8037](https://eips.ethereum.org/EIPS/eip-8037)
**Kernel address in the report:** `0xbac849bb641841b44e965fb01a4bf5f074f84b4d`

### Evidence

The report records 126,266 out-of-gas rows and 126,308 revert rows for the
Kernel address. Its largest revert cluster contains 116,232 rows. Its largest
out-of-gas clusters identify `SSTORE` with both fixed-gas and fractional-gas
classification. The measured state-gas reservoir is zero in these clusters.

Example measured transactions:

- `0x501a74ad9c5c6c232f2c2254adf5ccf6f97251f2afbb55e7aa757182ccda08ba`,
  block `21,330,103`, gas delta `-15,833`.
- `0xdfce79be3703ced074f5f1a77da0952da7b5794c05d3e1379b6ee58d4669ba65`,
  block `21,331,562`, gas delta `-15,833`.

Both sample transactions call EntryPoint. Their calldata starts with
`0x765e827f`.

### Current source path

The source was checked at commit
`f2a84a332ec5a722e7e95a0d64601905c3c87fe9` on the `dev` branch:

- [`Kernel.validateUserOp` and `_processUserOp`](https://github.com/zerodevapp/kernel/blob/f2a84a332ec5a722e7e95a0d64601905c3c87fe9/src/Kernel.sol#L100-L161)
- [`Kernel.executeUserOp`](https://github.com/zerodevapp/kernel/blob/f2a84a332ec5a722e7e95a0d64601905c3c87fe9/src/Kernel.sol#L201-L224)
- [`ModuleManager._checkAndIncrementNonce`](https://github.com/zerodevapp/kernel/blob/f2a84a332ec5a722e7e95a0d64601905c3c87fe9/src/core/ModuleManager.sol#L327-L338)
- Enable-mode processing can install a module and increment a nonce before the
  user operation runs. These are concrete first-write candidates.

### What can break

The first use of a Kernel account can write nonce or module state. Under the
new state-gas schedule, that first `SSTORE` can exceed the fixed
`callGasLimit` inside a user operation. The operation can revert even when a
later operation from the same account would succeed. This creates a cold-start
compatibility failure for account creation, module installation, or first-use
authorization.

### DCEPT replay

1. Use a fresh Kernel account and a fixed deterministic deployment state.
2. Submit one enable-mode user operation that performs the first nonce and
   module writes.
3. Run the same packed user operation under Osaka and Glamsterdam rules.
4. Keep `callGasLimit`, `verificationGasLimit`, `preVerificationGas`, and the
   transaction gas limit identical.
5. Record the first changed storage slot and the exact revert data.
6. Repeat the operation after the first write. A pass on the warm repeat does
   not clear the cold-start finding.

Verify that the deployed bytecode matches the reported Kernel address. The
report address is one deployment, not a statement about every Kernel version.

## 3. Across SpokePool

**Severity:** Critical
**Proof status:** `A+B`; controlled replay pending
**Rule:** [EIP-8037](https://eips.ethereum.org/EIPS/eip-8037)
**Ethereum SpokePool:** `0x5e5b726c81f43b953a62ad87e2835c85c4d9dd3b`

### Evidence

The report records 32,962 out-of-gas rows and 34,359 revert rows for the
Ethereum SpokePool. Across the listed SpokePools, it records 102,653 G4 rows.
The dominant Ethereum selector is `0x1bc74526`. The dominant call chain is a
deep `CALL` path at depth five. Its median gas delta is `-14,945` and its 90th
percentile is `-570`.

Example measured transactions:

- `0x9b07d56b8fd434c8a8a1bd8e1b5c674109e5fe7932014b1497cd603f0fc9638d`,
  block `24,416,829`, gas delta `-570`.
- `0xa839cd849e550f153d406f891ecd4d9d6939837a1603b071ee8b76b4c0b865db`,
  block `24,398,667`, gas delta `-83,464`.

### Current source path

The source was checked at commit
`19e346a5415e2ebb18fafe590f76dc90f413d1b5` on the `master` branch:

- [`fillRelay` and `fillV3Relay`](https://github.com/across-protocol/contracts/blob/19e346a5415e2ebb18fafe590f76dc90f413d1b5/contracts/spoke-pools/SpokePool.sol#L986-L1025)
- [`executeRelayerRefundLeaf`](https://github.com/across-protocol/contracts/blob/19e346a5415e2ebb18fafe590f76dc90f413d1b5/contracts/spoke-pools/SpokePool.sol#L1276-L1325)
- `_fillRelay` writes `fillStatuses[relayHash]`, then transfers tokens to the
  recipient and can call a recipient callback.
- Relayer refund execution verifies a proof, marks the leaf as claimed, and
  distributes refunds.

### What can break

A relay fill or refund can reach a deep token transfer and bookkeeping path.
The added state-gas cost can make that nested call fail. The result can be a
failed fill, a failed refund, or a delayed bridge operation. Do not call this a
loss of funds without a controlled replay and a review of the recovery path.

### DCEPT replay

1. Verify the proxy implementation and chain for the SpokePool address.
2. Replay the exact `fillRelay` transaction at its historical block.
3. Use identical relay data, token balances, approvals, and recipient code in
   both fork environments.
4. Trace the nested call at selector `0x1bc74526` and identify the first state
   write that changes the outcome.
5. Repeat with `executeRelayerRefundLeaf` if the sample is a refund path.

## 4. Socket batch route

**Severity:** High
**Proof status:** `A+B*`; deployed-code identity pending
**Rule:** [EIP-8037](https://eips.ethereum.org/EIPS/eip-8037)
**Reported address:** `0x87be3fc3edfe10cb8ce1244d6a1969fc55f9f83c`

### Evidence

The report records 16,717 G4 rows. All rows are out of gas. The report counts
88,463 observed transactions for the address, so the measured rate is about
18.90%. The largest clusters reach the unlabeled target
`0x407be335f94c30ee2876c4cf86ce08a46f518cf3`, USDC
`0x43506849d7c04f9138d1a2050bbf3a0c054402dd`, and WETH
`0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2`.

Example measured transactions:

- `0x736c770b992237c9c5a5db7d6d51a03cfc5b0254f3037a5eac9b2e41999a0782`,
  block `22,034,041`, gas delta `-57,307`.
- `0xcfd8fd81037c47e9b04a5b5a2b3b2b24e1f1ae1fedd00cde34296cb9ae0356fa`,
  block `21,369,340`, gas delta `-90,040`.

### Current source path

The current public source was checked at commit
`5d86ce8ae042b2f691dc0d91e8ab832636334d52` on the `master` branch:

- [`SocketGateway.executeRoute`](https://github.com/SocketDotTech/bungee-contracts-public/blob/5d86ce8ae042b2f691dc0d91e8ab832636334d52/src/SocketGateway.sol#L87-L102)
- [`SocketGateway.executeRoutes`](https://github.com/SocketDotTech/bungee-contracts-public/blob/5d86ce8ae042b2f691dc0d91e8ab832636334d52/src/SocketGateway.sol#L190-L211)
- The gateway delegatecalls route modules and bubbles route failures.

The report calls the measured contract `SocketBatcher` and reports selector
`0xfa98a33f`. The current repository calls its main entry contract
`SocketGateway`. Compute the deployed bytecode hash and compare it with the
source build before you attribute the measured result to this repository.

### What can break

A batch route can execute many delegatecalls and token operations. A first
state write in a nested route can consume the new state-gas cost. The batch can
then run out of gas and fail as one operation. The report marks the deployed
contract as immutable, so a route or batch-shape change may be required.

### DCEPT replay

1. Resolve the implementation and code hash for the reported address.
2. Decode the sample transaction with selector `0xfa98a33f`.
3. Recreate every route, token balance, approval, and recipient contract in the
   controlled state.
4. Replay the same batch with the same transaction gas limit.
5. Record the first failing delegatecall and the affected token operation.

Do not publish a Socket finding until step 1 passes.

## 5. CoW Protocol GPv2Settlement

**Severity:** High
**Proof status:** `A+B`; controlled replay pending
**Rule:** [EIP-8037](https://eips.ethereum.org/EIPS/eip-8037)
**Settlement address:** `0x9008d19f58aabd9ed0d60971565aa8510560ab41`

### Evidence

The report records 105,390 G4 rows for GPv2Settlement. It classifies 105,388
as out of gas and two as non-out-of-gas reverts. The report counts 1,569,513
observed transactions, which gives a measured rate of about 6.71%.

The largest cluster reaches USDC
`0x43506849d7c04f9138d1a2050bbf3a0c054402dd` through selector `0x13d79a0b`.
The cluster is an `SSTORE` at call depth four. Its median gas delta is
`-9,492`. The sample access-list median is 48 addresses or slots, so the
transactions already use broad access lists.

Example measured transaction:

| Field | Value |
| --- | --- |
| Hash | `0xdb8f0d753c48055d7ee23671c2bdbf1006d61d4102945fca9442637a5f7e03c5` |
| Block | `21,335,640` |
| From | `0x008300082c3000009e63680088f8c7f4d3ff2e87` |
| To | `0x9008d19f58aabd9ed0d60971565aa8510560ab41` |
| Gas limit | `0x10365c` (1,062,492) |
| Calldata | 4,652 bytes; starts with `0x13d79a0b` |
| Access list entries | 22 |

### Current source path

The source was checked at commit
`c07a93e3596194c5e3cf331c755a3f9f0e4a17d8` on the `main` branch:

- [`GPv2Settlement.settle`](https://github.com/cowprotocol/contracts/blob/c07a93e3596194c5e3cf331c755a3f9f0e4a17d8/src/contracts/GPv2Settlement.sol#L121-L156)
- [`executeInteractions`](https://github.com/cowprotocol/contracts/blob/c07a93e3596194c5e3cf331c755a3f9f0e4a17d8/src/contracts/GPv2Settlement.sol#L446-L468)
- [`freeOrderStorage`](https://github.com/cowprotocol/contracts/blob/c07a93e3596194c5e3cf331c755a3f9f0e4a17d8/src/contracts/GPv2Settlement.sol#L474-L486)
- Settlement executes pre-, mid-, and post-interactions around vault transfers.

### What can break

A settlement batch can pay out many tokens and update order state. A first
write in a paid-out token or a settlement slot can consume the new state-gas
cost. The whole batch can then fail. Solver batch composition and token
ordering can change the outcome. The report marks the deployed settlement
contract as immutable.

### DCEPT replay

1. Use the exact settlement calldata and access list from the sample.
2. Recreate the token balances, approvals, order storage, vault state, and
   interaction contracts in both fork environments.
3. Use the same solver transaction gas limit and transaction sender.
4. Compare the settlement result and trace at selector `0x13d79a0b`.
5. Split the batch after a failure. This tests whether the failure depends on
   batch composition.

## 6. Alchemy Modular Account

**Severity:** High
**Proof status:** `A+B`; controlled replay pending
**Rules:** [EIP-8037](https://eips.ethereum.org/EIPS/eip-8037) and
[EIP-8038](https://eips.ethereum.org/EIPS/eip-8038)
**Reported deployment:** `0x000000000000c5a9089039570dd36455b5c07383`

### Evidence

The report records 12,023 EIP-8037 out-of-gas rows and 12,023 mirrored
reverts. It records 29,958 EIP-8038 reverts and no EIP-8038 out-of-gas rows.
The combined footprint is 54,004 rows. The EIP-8037 dominant cluster has
11,989 rows. It reaches `SSTORE` at call depth five, after zero completed
storage writes, with a median gas delta of `-111,288`. The EIP-8038 dominant
cluster has 29,947 rows. It reaches `EXTCODECOPY` at call depth four and
returns EntryPoint custom error `0x220266b6`.

The report marks the implementation as `SemiModularAccountBytecode` and shows
EntryPoint v0.7 as the entry contract for 11,989 EIP-8037 rows and 29,947
EIP-8038 rows. The report data marks this address as a proxy and upgradable,
while its narrative calls it implementation bytecode. Resolve the deployed
proxy and implementation before making an ownership or upgrade claim.

### Current source path

The source was checked at commit
`ab9c0c24752d83f79ba7b8c112797502d2c2c5a5` on the `develop` branch:

- [`SemiModularAccountBytecode`](https://github.com/alchemyplatform/modular-account/blob/ab9c0c24752d83f79ba7b8c112797502d2c2c5a5/src/account/SemiModularAccountBytecode.sol#L34-L60)
- [`v2` deployment record](https://github.com/alchemyplatform/modular-account/blob/ab9c0c24752d83f79ba7b8c112797502d2c2c5a5/deployments/v2/Deployments.md#L19-L20)
- [`AccountBase.validateUserOp`](https://github.com/alchemyplatform/modular-account/blob/ab9c0c24752d83f79ba7b8c112797502d2c2c5a5/src/account/AccountBase.sol#L41-L70)
- [`ModularAccountBase._validateUserOp`](https://github.com/alchemyplatform/modular-account/blob/ab9c0c24752d83f79ba7b8c112797502d2c2c5a5/src/account/ModularAccountBase.sol#L401-L430)
- [`ModuleManagerInternals._installValidation`](https://github.com/alchemyplatform/modular-account/blob/ab9c0c24752d83f79ba7b8c112797502d2c2c5a5/src/account/ModuleManagerInternals.sol#L57-L155)
- [`AccountStorage`](https://github.com/alchemyplatform/modular-account/blob/ab9c0c24752d83f79ba7b8c112797502d2c2c5a5/src/account/AccountStorage.sol#L70-L82)
- The account stores validation, execution, hook, and interface mappings. A
  first installation can therefore create the first expensive storage write.

### What can break

Under EIP-8037, a first-use account validation or module installation can fail
on its first `SSTORE` inside the fixed user-operation gas budget. Under
EIP-8038, the same account population can hit a non-out-of-gas EntryPoint
check around `EXTCODECOPY`. These are separate leads. A fix for one schedule
does not prove a fix for the other.

### DCEPT replay

1. Use the official Alchemy deployment artifacts and resolve the proxy, if
   present, to its implementation.
2. Create a fresh account with the same factory, signer, module, and init data
   in both controlled fork environments.
3. Submit the same first-use UserOperation through EntryPoint v0.7.
4. Keep all UserOperation gas fields and the transaction gas limit identical.
5. Trace the first `SSTORE` under EIP-8037 and the `EXTCODECOPY`-adjacent
   failure under EIP-8038.
6. Repeat the operation after initialization. A warm repeat does not clear a
   cold-start finding.

## 7. 0x Settler: EIP-8038 reserve case

**Severity:** High
**Proof status:** `A+B`; controlled replay pending
**Rule:** [EIP-8038](https://eips.ethereum.org/EIPS/eip-8038), not EIP-8037
**Reported address:** `0xbbbbbbbbbb9cc5e90e3b3af64bdaf62c37eeffcb`

### Evidence

The report records 11,708 revert rows and one out-of-gas site for this Settler.
Its largest cluster contains 2,819 `EXTCODESIZE` observations. The average
gas delta in that cluster is `+2,183,180`, with a median of `+1,526,830`.
The report links the calls to flash-loan and arbitrage routes. It also notes
that the raw project label is incorrect and identifies the contract as 0x.

Example measured transactions:

- `0x313dae77c6cad0197da088c18857c82d3819fb2ee5c1f45e9e1fd5dd6defa258`,
  block `22,368,982`, gas delta `503,430`.
- `0x4106a06b259a23ccbdecec2ef5e22d1bbe53e1d4a8d68e3f613d0d6b3d465f23`,
  block `22,368,706`, gas delta `6,878,830`.

### Current source path

The source was checked at commit
`1df908742d38cf407f667df6518dae6e04a01ac3` on the `master` branch:

- [`Settler.execute`](https://github.com/0xProject/0x-settler/blob/1df908742d38cf407f667df6518dae6e04a01ac3/src/Settler.sol#L118-L131)
- [`Settler.executeWithPermit`](https://github.com/0xProject/0x-settler/blob/1df908742d38cf407f667df6518dae6e04a01ac3/src/Settler.sol#L132-L147)
- [`CheckCall`](https://github.com/0xProject/0x-settler/blob/1df908742d38cf407f667df6518dae6e04a01ac3/src/utils/CheckCall.sol#L48-L68)
- `CheckCall` uses `extcodesize(target)` when a call returns no data. EIP-8038
  raises cold account and related access costs.

### What can break

A nested route can use a cold account check and then hit a caller gas or
slippage limit. The Settler can revert even when the route worked under the
current schedule. This is an EIP-8038 lead. Do not mix it with the EIP-8037
state-creation tests.

### DCEPT replay

1. Use a controlled fork that implements EIP-8038.
2. Replay the exact Settler calldata and access list.
3. Trace the first cold `EXTCODESIZE` or related account access.
4. Compare the revert data and the route-level slippage result.
5. Test the route with a complete access list. A changed result identifies an
   access-warmth dependency.

## Evidence to collect for every replay

### Historical transaction samples

The following metadata was checked on 2026-09-03 with the public Ethereum RPC
`https://ethereum-rpc.publicnode.com`. The data identifies the transactions;
it does not replace a controlled replay. For Across and 0x, the transaction
target is an upstream contract and the reported contract appears inside the
trace.

| Target | Transaction | Block | Entry target | Selector | Gas limit | Calldata | Access list |
| --- | --- | ---: | --- | --- | ---: | ---: | ---: |
| EntryPoint | `0x5e0e38047dfa6fce58548a2f0b402bc3faccf4e7a3d5860f5b3c83796052ad66` | 21,349,727 | `0x0000000071727de22e5e9d8baf0edac6f37da032` | `0x765e827f` | `0xc06b5` | 1,252 bytes | 0 |
| Kernel via EntryPoint | `0x501a74ad9c5c6c232f2c2254adf5ccf6f97251f2afbb55e7aa757182ccda08ba` | 21,330,103 | `0x0000000071727de22e5e9d8baf0edac6f37da032` | `0x765e827f` | `0x4cec5` | 1,060 bytes | 0 |
| Across | `0x9b07d56b8fd434c8a8a1bd8e1b5c674109e5fe7932014b1497cd603f0fc9638d` | 24,416,829 | `0x9ccc2f3ecde026230e11a5c8799ac7524f2bb294` | `0x1bc74526` | `0x2e3a2` | 1,092 bytes | 0 |
| Socket | `0x736c770b992237c9c5a5db7d6d51a03cfc5b0254f3037a5eac9b2e41999a0782` | 22,034,041 | `0x87be3fc3edfe10cb8ce1244d6a1969fc55f9f83c` | `0xfa98a33f` | `0xa9a8e` | 1,796 bytes | 0 |
| CoW | `0xdb8f0d753c48055d7ee23671c2bdbf1006d61d4102945fca9442637a5f7e03c5` | 21,335,640 | `0x9008d19f58aabd9ed0d60971565aa8510560ab41` | `0x13d79a0b` | `0x10365c` | 4,652 bytes | 22 |
| Alchemy via EntryPoint | `0x8510d7269661119d021ab1f1632e9d9e90a01ad7b2244e3203276a4da02a0f2d` | 23,028,526 | `0x0000000071727de22e5e9d8baf0edac6f37da032` | `0x765e827f` | `0x549bb` | 1,636 bytes | 0 |
| 0x | `0x313dae77c6cad0197da088c18857c82d3819fb2ee5c1f45e9e1fd5dd6defa258` | 22,368,982 | `0x3363c34f9986a0a2b58bebc96dd51aa9b74a782a` | route-specific; see trace | `0x15f900` | 944 bytes | 35 |

Store these fields in the DCEPT report and in the issue record:

- project name, repository URL, source commit, and deployed address;
- `comparison_mode`, protocol names, fork block, and client versions;
- baseline and candidate state fingerprints;
- the exact transaction sender, target, value, gas limit, calldata, and access
  list;
- the block context used for the replay;
- normalized result, revert data, and full trace;
- first changed opcode or state write;
- the project-level result after the RPC or execution result changes;
- severity, confidence level, and the steps that reproduce the result.

## Publish gate

Use this wording until the replay is complete:

> The Ethereum repricing impact data identifies a measured compatibility lead
> for `<project>`. DCEPT has mapped the lead to `<source path>`. A controlled
> pre- and post-Glamsterdam replay is pending.

Use a stronger finding only after level C and level D:

> DCEPT reproduced `<project>` behavior with identical state and inputs under
> pre-Glamsterdam and Glamsterdam rules. The first changed operation is
> `<operation>`. The project changes from `<baseline result>` to
> `<candidate result>`.

Do not call a level A or level B entry a confirmed break. Do not call a
Mainnet-versus-Platåberget run an upgrade differential unless the report marks
state equivalence as `verified`.

## Secondary validation queue

These entries appear in the same official report. They are not in the first
replay order because the reported contract is usually an inner call site. The
trace must first prove that the named project owns the failing check.

| Project or label | Measured lead | Why it waits | Next check |
| --- | --- | --- | --- |
| 1inch Aggregation Router v6 (`0x111111125421ca6dc452d289314280a0f8842a65`) | 40,727 combined G4 rows; most are EIP-8038 `EXTCODESIZE` clusters | Only one EIP-8037 row and no EIP-8038 row enters through the router directly | Match verified Router v6 bytecode, then identify the direct entry contract and failing frame. |
| Sushi labeled cohort | 82,498 EIP-8038 reverts across more than 386 addresses | The dominant signature also appears in searcher and arbitrage callers | Match bytecode and trace ownership before contacting Sushi. |
| Uniswap, Curve, Balancer, and token contracts | Large passive inner-site counts | The pool or token often cannot change the caller's gas budget | Route the finding to the caller, solver, or batcher that owns the gas envelope. |

Keep these items as watch entries. Do not use them as launch findings until a
source path and a controlled replay exist.
