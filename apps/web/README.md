# GlamProbe Cloud

This directory is the optional hosted GlamProbe Cloud application.

It adds teams, wallet login, encrypted targets, API tokens, quotas, a dashboard, and durable cloud runs. It needs PostgreSQL, Vercel Workflow, and the environment values in `.env.example`.

It is not part of the Rust build. A local user does not need this directory, Node.js, a database, login, or cloud credentials to use the GlamProbe CLI.

Use the repository root for local compatibility tests. Use [DEPLOYMENT.md](DEPLOYMENT.md) only when you deploy the Cloud application.
