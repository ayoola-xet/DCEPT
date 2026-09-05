ALTER TABLE runs ADD COLUMN IF NOT EXISTS run_configuration JSONB;

UPDATE runs
SET run_configuration = jsonb_build_object(
  'comparison_mode', 'client_differential',
  'baseline_protocol', NULL,
  'candidate_protocol', NULL,
  'baseline_client', NULL,
  'candidate_client', NULL,
  'baseline_state_fingerprint', NULL,
  'candidate_state_fingerprint', NULL,
  'control_reason', NULL,
  'same_target', false,
  'allow_mode_override', false,
  'mode_override_reason', NULL,
  'historical_fork_boundary', false
)
WHERE run_configuration IS NULL;

ALTER TABLE runs ALTER COLUMN run_configuration SET NOT NULL;
