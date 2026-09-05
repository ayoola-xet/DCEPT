# Contributing to DCEPT

Thank you for your interest in DCEPT.

## Before you start

- Search the existing issues before you create an issue.
- Open an issue before you make a large change.
- Use the security process for a possible vulnerability.
- Read the [Code of Conduct](.github/CODE_OF_CONDUCT.md).

## Report a defect

Use the GitHub defect report form. Include these items:

- The DCEPT version or commit.
- The operating system.
- The command or interface that you used.
- A small scenario that reproduces the defect.
- The expected result.
- The actual result.

Remove RPC credentials, private keys, signed transactions, and private endpoint
URLs from the report.

## Make a change

1. Fork the repository.
2. Create a branch from `master`.
3. Make one focused change.
4. Add or update tests.
5. Update the documentation when behavior changes.
6. Run all applicable checks.
7. Open a pull request.

Keep protocol logic in the Rust core. Keep probe definitions in `probes/`. Do
not copy comparison, assertion, fuzz, or report logic into TypeScript.

## Run the checks

Run the Rust checks from the repository root:

```sh
cargo fmt --check
cargo test
cargo audit --deny warnings
node scripts/verify-local-run.mjs
node scripts/verify-comparison-modes.mjs
node scripts/verify-glamsterdam-probes.mjs
node scripts/verify-action-report.mjs
node scripts/verify-cross-path-conformance.mjs
```

Run the web checks:

```sh
cd apps/web
npm ci
npm audit --omit=dev --audit-level=moderate
npm run verify:probes
npm run typecheck
npm run build
npm run verify:wasm-trace
```

Run the adapter checks:

```sh
cd adapters
npm ci
npm audit --omit=dev --audit-level=moderate
npm run check
```

Use `cargo fmt` to format Rust code. Follow the existing TypeScript and
JavaScript style.

## Pull request requirements

A pull request must:

- Explain the problem and the change.
- Include tests for changed behavior.
- Pass continuous integration.
- Contain no credentials or private user data.
- Keep generated files in sync with their source files.
- Use an MIT-compatible license for new dependencies.

By contributing, you agree that your contribution uses the repository's MIT
License.
