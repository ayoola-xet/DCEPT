# DCEPT

DCEPT means Differential Compatibility for Ethereum Protocol Transitions.

It compares two Ethereum environments:

- **Baseline:** The current or reference environment.
- **Candidate:** The new or changed environment.

DCEPT sends planned requests to both environments. It normalizes the responses.
It then reports the exact differences.

Use DCEPT before an Ethereum protocol upgrade. It can show how the upgrade can
affect:

- Smart contracts.
- Wallets.
- Block explorers.
- Indexers.
- RPC libraries.
- Account abstraction systems.
- Ethereum clients.
- Builder API integrations.
- Gas estimation.

DCEPT is not a smart-contract security scanner. It tests changes in observable
behavior.

DCEPT is in pre-release development. Interfaces and scenario fields can change
before version 1.0.0.

## What DCEPT can do

DCEPT can:

- Compare any Ethereum JSON-RPC request.
- Compare HTTP API responses.
- Compare pre-upgrade rules with post-upgrade rules.
- Compare two Ethereum clients.
- Check required response values.
- Ignore unstable fields, such as block hashes.
- Permit specified numeric differences.
- Generate repeatable fuzz-test inputs.
- Reduce a failing scenario to a smaller reproducer.
- Replay official Engine API fixtures.
- Create detailed JSON reports.
- Run in a browser, from the CLI, or in GitHub Actions.
- Test through `ethers`, `viem`, Foundry, and Hardhat adapters.

## How it works

The main flow has four steps.

```text
Select a scenario
       ↓
Connect baseline and candidate targets
       ↓
Run the same planned operations
       ↓
Review the exact differences
```

A **scenario** is a YAML file that defines the requests and checks.

A **finding** is a response difference or a failed check.

A **state fingerprint** identifies the starting chain state. Matching fingerprints show that both environments started from equivalent state.

## What a result means

DCEPT can return these main results:

- `matched`: Both targets produced the same normalized behavior.
- `findings`: DCEPT found a difference or a failed check.
- `inconclusive`: DCEPT found a difference, but it cannot confirm equivalent starting state.

A finding is not always a defect. A protocol upgrade can create an intentional difference. Review the scenario and report before you classify the finding.

## Choose a comparison mode

Select one mode before you run a test.

### Upgrade differential

Use this mode to compare pre-upgrade rules with post-upgrade rules.

This is the main DCEPT mode. Use the same starting state and the same logical inputs on both targets.

### Client differential

Use this mode to compare two Ethereum clients under the same protocol rules.

For example, you can compare Geth with Reth on the same fork and state.

### Control

Use this mode to check DCEPT itself.

A control uses an intentional difference. It proves that DCEPT can detect the difference. It does not prove protocol compatibility.

## Start with the browser UI

This is the easiest way to use DCEPT.

You need Node.js 24 or later.

```sh
git clone https://github.com/ayoola-xet/DCEPT.git dcept
cd dcept/apps/web
npm install
npm run dev
```

Open `http://localhost:3000`.

The local workspace does not need a login, wallet, database, or environment file.

Complete these steps in the UI:

1. Select a built-in probe or load a YAML scenario.
2. Select the comparison mode.
3. Enter the baseline and candidate RPC targets.
4. Enter matching state fingerprints when you run an upgrade or client comparison.
5. Enter the scenario inputs.
6. Select an execution host.
7. Select **Run differential**.

Use **Browser** when both targets allow Cross-Origin Resource Sharing (CORS). CORS is the browser rule that controls requests to another origin.

Use **Vercel route** for public HTTPS read targets that do not allow CORS. This route stores no run data. It does not accept credentials or write requests.

Use the CLI for authenticated Engine API requests, write requests, and fuzz tests.

## Start with the CLI

The CLI is a standalone Rust program. It does not need Node.js or Cloud services.

You need Rust 1.85 or later.

```sh
git clone https://github.com/ayoola-xet/DCEPT.git dcept
cd dcept
cargo build
```

Run a scenario against two targets.

```sh
./target/debug/dcept run scenario.yaml \
  --baseline https://baseline.example/rpc \
  --candidate https://candidate.example/rpc
```

Install the `dcept` command if required.

```sh
cargo install --path .
```

Validate a scenario without sending any network request.

```sh
dcept validate examples/transfer-to-fresh-address.yaml
```

Save a report to a file.

```sh
dcept run scenario.yaml \
  --baseline https://baseline.example/rpc \
  --candidate https://candidate.example/rpc \
  --output report.json
```

The CLI uses these exit codes:

- `0`: The run has no findings.
- `1`: The command failed.
- `2`: The run has one or more findings.

## Research real project compatibility

The [Glamsterdam impact ledger](research/glamsterdam-impact-ledger.md) tracks
current projects that may be affected by the proposed gas changes. It records
the measured evidence, the matching source path, the severity, and the next
controlled DCEPT replay.

Treat ledger entries as leads until a replay uses equivalent state under both
protocol rule sets. Do not describe a Mainnet-versus-testnet result as an
upgrade differential.

## Run a controlled protocol transition test

This repository includes a controlled Geth lab. The lab starts two local Ethereum nodes.

- The baseline node uses Osaka rules.
- The candidate node uses Amsterdam rules.
- Both nodes use the same genesis state.

This test isolates the protocol-rule change from unrelated chain-state changes.

The lab uses Docker to run both nodes with a pinned client build. Docker is only required for this lab. Normal browser and CLI runs do not require Docker.

Start the lab.

```sh
cargo build
node scripts/controlled-geth-fork-lab.mjs
```

The command prints these values:

- The baseline RPC URL.
- The candidate RPC URL.
- The shared state fingerprint.

Keep the lab running while you use the browser UI. Press `Ctrl+C` to stop it.

Run the automated check with this command:

```sh
node scripts/controlled-geth-fork-lab.mjs --verify
```

Run the recorded EntryPoint v0.7 Level C replay:

```sh
node scripts/replay-entrypoint-v07.mjs \
  --output research/entrypoint-v07-replay-report.json
```

This replay needs an archive RPC that supports `debug_traceTransaction` with
`prestateTracer`. It uses Docker to run two local Geth nodes.

The recorded Level D check also tests the current Pimlico Alto estimator:

- [`entrypoint-v07-level-d.json`](research/entrypoint-v07-level-d.json) records
  an unsafe Glamsterdam `verificationGasLimit` result.
- [`entrypoint-v07-level-d-queue.md`](research/entrypoint-v07-level-d-queue.md)
  explains the test method and its signature limitation.
- [`entrypoint-v07-user-operation.json`](research/entrypoint-v07-user-operation.json)
  contains the complete packed UserOperation used for the estimate.

## Understand a scenario

A scenario is a YAML document. It contains a version, a name, and one or more actions.

This example compares one block response:

```yaml
version: 1
name: latest-block
description: Compare one block response.

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

The `method` field contains the JSON-RPC method.

The `params` field contains the method parameters.

The `ignore_paths` field removes unstable values from the comparison.

The `numeric_tolerances` field permits a defined numeric difference.

Paths use RFC 6901 JSON Pointer syntax. An empty path selects the full response.

## Use built-in Glamsterdam probes

The built-in probe files live in `probes/glamsterdam/`.

List all probes.

```sh
dcept probe list
```

Show one probe.

```sh
dcept probe show glamsterdam/gas-repricing-estimate
```

Run one probe.

```sh
dcept probe run glamsterdam/gas-repricing-estimate \
  --baseline https://baseline.example/rpc \
  --candidate https://candidate.example/rpc \
  --mode upgrade-differential \
  --baseline-protocol osaka \
  --candidate-protocol glamsterdam \
  --baseline-state-fingerprint sha256:STATE \
  --candidate-state-fingerprint sha256:STATE \
  --var sender=0x0000000000000000000000000000000000000001 \
  --var recipient=0x0000000000000000000000000000000000000002
```

See [`probes/README.md`](probes/README.md) for probe inputs and fixture requirements.

## Reproduce a live faucet compatibility failure

The built-in PoW faucet probe checks a live Platåberget target. It compares a
1-wei transfer to an existing account with the same transfer to a fresh account.
The faucet configuration recorded for Glamsterdam devnet-6 uses a 100000 gas
limit. A fresh-account transfer needs about 200000 gas on the target.

Run the probe with the same target URL in control mode:

```sh
dcept probe run glamsterdam/powfaucet-fresh-account-transfer \
  --baseline https://rpc.plataberget.ethpandaops.io \
  --candidate https://rpc.plataberget.ethpandaops.io \
  --baseline-name existing-recipient \
  --candidate-name fresh-recipient \
  --mode control \
  --control-reason "Reproduce the devnet faucet 100000-gas cap for a fresh-account transfer." \
  --output powfaucet-plataberget-report.json
```

Exit code `2` means that the control found the intended difference. The report
should show about `0x5244` (21060) gas for the existing account and about
`0x31f38` (204600) gas for the fresh account. The capped `eth_call` should show
an out-of-gas error for the fresh account. This is a live compatibility
reproducer. It is not proof of a controlled pre-upgrade versus post-upgrade
result.

The original report is tracked in the
[Glamsterdam devnet issue](https://github.com/ethpandaops/glamsterdam-devnets/issues/46).
Use the DCEPT JSON report as independent evidence for the current target.

## Read a report

Each report includes this evidence:

- The selected comparison mode.
- The baseline and candidate protocol identities.
- The client identities when applicable.
- The state fingerprints.
- The resolved scenario.
- The prepared requests.
- The normalized responses.
- The exact response differences.
- The failed assertions.
- The final conclusion and warnings.

Keep the report with the scenario and target configuration. These records help another user reproduce the result.

## Fuzz and minimize a test

Fuzzing creates deterministic input variations. The same seed creates the same cases.

```sh
dcept fuzz examples/fuzz-estimate-gas.yaml \
  --baseline https://baseline.example/rpc \
  --candidate https://candidate.example/rpc
```

Minimization removes actions that are not required to reproduce a finding.

```sh
dcept minimize scenario.yaml \
  --baseline https://baseline.example/rpc \
  --candidate https://candidate.example/rpc \
  --output reproducer.yaml
```

The minimizer repeats requests. Use disposable targets when a scenario can change chain state.

## Architecture

One Rust core controls DCEPT behavior.

The Rust core owns these functions:

- Scenario parsing and validation.
- Request planning.
- Assertions.
- Normalization.
- Comparison.
- Deterministic fuzzing.
- Minimization rules.
- Report generation.

The CLI calls the Rust core directly.

The browser loads the Rust core as WebAssembly. WebAssembly is a portable binary format that can run in a browser. JavaScript sends the requests that Rust plans. Rust evaluates the responses.

DCEPT Cloud also uses the Rust core. Cloud is optional and downstream of the core.

## Optional Cloud features

DCEPT Cloud adds these features:

- Wallet sign-in.
- Teams.
- Encrypted targets.
- Stored scenarios and reports.
- Durable runs.
- API tokens.
- Quotas.

Cloud needs PostgreSQL and these environment values:

- `DATABASE_URL`
- `ENCRYPTION_KEY`
- `SESSION_SECRET`

The local browser workspace and CLI do not need these values.

See [`apps/web/DEPLOYMENT.md`](apps/web/DEPLOYMENT.md) for deployment instructions.

## Safety

DCEPT does not store private keys. It does not sign transactions.

A scenario can submit a pre-signed transaction. A scenario can also call another write method.

Review a scenario before you run it. Use an isolated test target for write requests. Do not use an unreviewed scenario with a production endpoint.

Report a possible vulnerability through the private process in
[`SECURITY.md`](SECURITY.md). Do not open a public issue for a possible
vulnerability.

## Development

Run the Rust checks.

```sh
cargo fmt --check
cargo test
node scripts/verify-comparison-modes.mjs
node scripts/verify-cross-path-conformance.mjs
```

Run the web checks.

```sh
cd apps/web
npm run verify:probes
npm run typecheck
npm run build
```

## Contributing

Contributions are welcome.

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) before you start. Follow the
[`CODE_OF_CONDUCT.md`](.github/CODE_OF_CONDUCT.md) in all project spaces.

Use GitHub Issues for defect reports, feature requests, and support questions.

## License

DCEPT uses the [MIT License](LICENSE).
