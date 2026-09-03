# Production deployment

Deploy `apps/web` as the Vercel project root.

## Public no-login deployment

The local-run page and `/api/public/run` work with no environment values. They
do not use a database, login, or Cloud storage. The public route accepts public
HTTPS endpoints only. It limits runs to 20 actions. It blocks fuzzing,
credential headers, write RPC methods, and write HTTP methods.

The route is public. Configure Vercel Firewall rate limiting before you expose
it to uncontrolled traffic.

## Required services

- Vercel Pro or Enterprise with Workflow enabled.
- Neon PostgreSQL.
- A KMS-managed, base64-encoded 32-byte encryption key.

## Required Cloud environment values

Set these values only when you enable Cloud pages, wallet login, and workflows:

```text
DATABASE_URL
ENCRYPTION_KEY
SESSION_SECRET
```

Use a different `ENCRYPTION_KEY` and `SESSION_SECRET` for preview and production. Do not change `ENCRYPTION_KEY` until you re-encrypt existing target credentials.

## First deployment

1. Create the Neon database.
2. Apply `db/schema.sql` to the database.
3. Set the required environment values in Vercel.
4. Deploy the `apps/web` directory.
5. Connect a wallet and create a target, scenario, and run.
6. Open `/runs`. Save a target and a scenario. Queue a run.
7. Confirm that the workflow completes and that the run report contains no endpoint credentials.

## Operations

- Back up PostgreSQL before schema changes.
- Restrict database access to the Vercel deployment.
- Review `audit_events` and active API tokens each month.
- Change organization quotas before you accept large fuzzing runs.
- Revoke an API token when its holder no longer needs access.
- Use test endpoints for scenarios that submit transactions.
