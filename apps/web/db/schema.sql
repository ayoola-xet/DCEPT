CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS memberships (
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS targets (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  endpoint_ciphertext TEXT NOT NULL,
  headers_ciphertext TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS scenarios (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  yaml_source TEXT NOT NULL,
  checksum TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  scenario_id TEXT NOT NULL REFERENCES scenarios(id) ON DELETE RESTRICT,
  baseline_target_id TEXT NOT NULL REFERENCES targets(id) ON DELETE RESTRICT,
  candidate_target_id TEXT NOT NULL REFERENCES targets(id) ON DELETE RESTRICT,
  baseline_endpoint_ciphertext TEXT NOT NULL,
  baseline_headers_ciphertext TEXT NOT NULL,
  candidate_endpoint_ciphertext TEXT NOT NULL,
  candidate_headers_ciphertext TEXT NOT NULL,
  scenario_yaml_source TEXT NOT NULL,
  input_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  run_configuration JSONB NOT NULL,
  case_count INTEGER NOT NULL DEFAULT 1 CHECK (case_count > 0),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'canceled')),
  report_json JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_tokens (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_prefix TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  scopes TEXT[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS organization_quotas (
  organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  maximum_concurrent_runs INTEGER NOT NULL DEFAULT 2 CHECK (maximum_concurrent_runs > 0),
  monthly_case_limit INTEGER NOT NULL DEFAULT 10000 CHECK (monthly_case_limit > 0),
  artifact_storage_limit_bytes BIGINT NOT NULL DEFAULT 1073741824 CHECK (artifact_storage_limit_bytes > 0)
);

CREATE INDEX IF NOT EXISTS runs_organization_created_at_idx ON runs (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_organization_created_at_idx ON audit_events (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS api_tokens_organization_created_at_idx ON api_tokens (organization_id, created_at DESC);
