ALTER TABLE runs ADD COLUMN IF NOT EXISTS case_count INTEGER NOT NULL DEFAULT 1;

ALTER TABLE runs ADD CONSTRAINT runs_case_count_positive CHECK (case_count > 0);
