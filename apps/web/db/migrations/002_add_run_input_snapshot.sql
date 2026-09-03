ALTER TABLE runs ADD COLUMN IF NOT EXISTS scenario_yaml_source TEXT;

UPDATE runs AS r
SET scenario_yaml_source = s.yaml_source
FROM scenarios AS s
WHERE r.scenario_id = s.id
  AND r.scenario_yaml_source IS NULL;

ALTER TABLE runs ALTER COLUMN scenario_yaml_source SET NOT NULL;

ALTER TABLE runs ADD COLUMN IF NOT EXISTS input_values JSONB NOT NULL DEFAULT '{}'::jsonb;
