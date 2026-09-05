# Changelog

This file records important changes to DCEPT.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
The project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Added

- Add DCEPT comparison modes and state-equivalence classification.
- Add built-in Glamsterdam probes.
- Add the Rust CLI, browser workspace, Cloud host, and downstream adapters.
- Add deterministic fuzzing, minimization, and Engine API fixture replay.

### Security

- Reject HTTP scenario paths that can change the target host.
- Reject hosted targets that resolve to non-public addresses.
- Limit response sizes in hosted execution paths.
- Add security headers and dependency audits.
