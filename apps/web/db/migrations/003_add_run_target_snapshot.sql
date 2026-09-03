ALTER TABLE runs ADD COLUMN IF NOT EXISTS baseline_endpoint_ciphertext TEXT;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS baseline_headers_ciphertext TEXT;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS candidate_endpoint_ciphertext TEXT;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS candidate_headers_ciphertext TEXT;

UPDATE runs AS r
SET baseline_endpoint_ciphertext = t.endpoint_ciphertext,
    baseline_headers_ciphertext = t.headers_ciphertext
FROM targets AS t
WHERE r.baseline_target_id = t.id
  AND r.baseline_endpoint_ciphertext IS NULL;

UPDATE runs AS r
SET candidate_endpoint_ciphertext = t.endpoint_ciphertext,
    candidate_headers_ciphertext = t.headers_ciphertext
FROM targets AS t
WHERE r.candidate_target_id = t.id
  AND r.candidate_endpoint_ciphertext IS NULL;

ALTER TABLE runs ALTER COLUMN baseline_endpoint_ciphertext SET NOT NULL;
ALTER TABLE runs ALTER COLUMN baseline_headers_ciphertext SET NOT NULL;
ALTER TABLE runs ALTER COLUMN candidate_endpoint_ciphertext SET NOT NULL;
ALTER TABLE runs ALTER COLUMN candidate_headers_ciphertext SET NOT NULL;
