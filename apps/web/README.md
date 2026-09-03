# GlamProbe Cloud

This directory is the optional hosted GlamProbe Cloud application.

It adds teams, wallet login, encrypted targets, API tokens, quotas, a dashboard, and durable cloud runs. It needs PostgreSQL, Vercel Workflow, and the environment values in `.env.example`.

It is not part of the Rust build. A local user does not need this directory, Node.js, a database, login, or cloud credentials to use the GlamProbe CLI.

## No-login local-run page

The `/` page is a public local-run workspace. It does not need `.env.local`.
It does not save scenarios, endpoints, responses, or account data. It loads the
Rust comparison core as WebAssembly in the browser.

```sh
npm install
npm run dev
```

Browser mode needs RPC endpoints that allow CORS. It does not support endpoint
credentials. Stateless Vercel mode accepts public HTTPS endpoints. It allows up
to 20 actions. It blocks fuzzing, credential headers, write RPC methods, and
write HTTP methods. Use the local CLI for authenticated endpoints, fuzzing, or
write tests.

Use the repository root for local compatibility tests. Use [DEPLOYMENT.md](DEPLOYMENT.md) only when you deploy the Cloud application.
