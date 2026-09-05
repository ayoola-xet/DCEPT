# DCEPT web hosts

This directory contains the no-login web host and the optional DCEPT Cloud
host.

It adds teams, wallet login, encrypted targets, API tokens, quotas, a dashboard, and durable cloud runs. It needs PostgreSQL, Vercel Workflow, and the environment values in `.env.example`.

All web paths use the packaged Rust engine for scenario validation, input
resolution, request planning, assertions, comparison, deterministic fuzzing,
state-equivalence classification, and report creation. JavaScript performs the network requests that Rust plans.
The browser uses the browser WebAssembly package. Server and Cloud paths use the
Node WebAssembly package.

It is not part of the Rust build. A local user does not need this directory, Node.js, a database, login, or cloud credentials to use the DCEPT CLI.

## Cloud console

After Cloud sign-in, open `/runs`. The console lets a team save encrypted
target settings, save versioned scenarios, queue a durable run, and view recent
run status. It shows the declared scenario inputs before it queues a run. Each
run stores the scenario source, input values, and encrypted target settings
that it uses. A later target rotation does not change a queued run. These
functions need the Cloud environment values and database schema. They do not
affect the public local-run page.

Use **Edit** for a scenario. Use **Rotate** for a target. A target rotation
requires a replacement endpoint and header set. The console never reads saved
target credentials. You can delete a target or scenario only when no run uses
it. This keeps historical run records valid.

## No-login local-run page

The `/` page is a public local-run workspace. It does not need `.env.local`.
It does not save scenarios, endpoints, responses, or account data. It loads the
Rust DCEPT engine as WebAssembly in the browser.

```sh
npm install
npm run dev
```

Browser mode needs RPC endpoints that allow CORS. It does not support endpoint
credentials. Stateless Vercel mode accepts public HTTPS endpoints. It allows up
to 20 actions. It blocks fuzzing, credential headers, write RPC methods, and
write HTTP methods. Use the local CLI for authenticated endpoints, fuzzing, or
write tests.

The page shows three comparison purposes. Upgrade differential is the primary
purpose. It compares pre-upgrade and post-upgrade protocol behavior. Client
differential checks two implementations under the same protocol rules. Control
performs a product self-test. The report always records the selected purpose.

Upgrade and client comparisons need matching state fingerprints for a
definitive result. The Rust engine marks other results as inconclusive.

Use the repository root for local compatibility tests. Use [DEPLOYMENT.md](DEPLOYMENT.md) only when you deploy the Cloud application.

## Probe definitions

The probe files under `../../probes/glamsterdam` are the source of truth. Run
`npm run generate:probes` after a probe change. This command creates
`lib/generated/glamsterdam-probes.json`. Do not edit that generated file.
