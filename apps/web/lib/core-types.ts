export type ProbeMetadata = {
  upgrade: string;
  eips: string[];
  category: string;
  risk: string;
  fixture_release?: string;
  sources: string[];
};

export type ComparisonMode = "upgrade_differential" | "client_differential" | "control";
export type StateEquivalenceStatus = "verified" | "unverified" | "mismatched" | "not_applicable";
export type ReportStatus = "matched" | "findings" | "inconclusive";

export type RunConfiguration = {
  comparison_mode: ComparisonMode;
  baseline_protocol?: string | null;
  candidate_protocol?: string | null;
  baseline_client?: string | null;
  candidate_client?: string | null;
  baseline_state_fingerprint?: string | null;
  candidate_state_fingerprint?: string | null;
  control_reason?: string | null;
  same_target: boolean;
  allow_mode_override: boolean;
  mode_override_reason?: string | null;
  historical_fork_boundary: boolean;
};

export type ScenarioInput = {
  description: string;
  kind: "string" | "address" | "quantity" | "block_tag" | "json";
  required: boolean;
  default?: unknown;
};

export type ScenarioView = {
  version: 1;
  name: string;
  description?: string;
  probe?: ProbeMetadata;
  inputs: Record<string, ScenarioInput>;
  actions: Array<{ kind: "rpc" | "http"; id: string; method: string }>;
  fuzz?: { cases: number; seed?: number };
};

export type Comparison = {
  ignore_paths: string[];
  numeric_tolerances: Array<{ path: string; absolute: number }>;
};

export type Assertion = {
  path: string;
  equals?: unknown;
  contains_all: unknown[];
  has_keys: string[];
  is_hex_quantity: boolean;
};

export type Expectations = {
  baseline: Assertion[];
  candidate: Assertion[];
};

export type RequestPlan =
  | { kind: "rpc"; method: string; params: unknown }
  | { kind: "http"; method: string; path: string; headers: Record<string, string>; body?: unknown };

export type ActionPlan = {
  id: string;
  baseline: RequestPlan;
  candidate: RequestPlan;
  comparison: Comparison;
  expect: Expectations;
};

export type RunPlan = {
  schema_version: 2;
  scenario_name: string;
  probe?: ProbeMetadata;
  run_configuration: RunConfiguration;
  state_equivalence_status: StateEquivalenceStatus;
  requests_equivalent: boolean;
  resolved_scenario: ScenarioView;
  actions: ActionPlan[];
};

export type AppliedMutation = {
  action: string;
  scope: "both" | "baseline" | "candidate";
  path: string;
  value: unknown;
};

export type FuzzPlan = {
  schema_version: 2;
  scenario_name: string;
  seed: number;
  cases: Array<{ index: number; mutations: AppliedMutation[]; plan: RunPlan }>;
};

export type OperationResult = {
  response: unknown | null;
  error: string | null;
  duration_ms: number;
};

export type ActionExecution = {
  id: string;
  baseline: OperationResult;
  candidate: OperationResult;
};

export type FuzzCaseExecution = {
  index: number;
  actions: ActionExecution[];
};

export type Diff = {
  path: string;
  kind: "value_mismatch" | "missing_baseline" | "missing_candidate" | "type_mismatch";
  baseline?: unknown;
  candidate?: unknown;
};

export type AssertionFailure = {
  target: string;
  path: string;
  rule: string;
  expected: unknown;
  actual?: unknown;
};

export type ActionReport = {
  id: string;
  baseline: OperationResult;
  candidate: OperationResult;
  normalized_baseline: unknown | null;
  normalized_candidate: unknown | null;
  diffs: Diff[];
  assertion_failures: AssertionFailure[];
};

export type RunReport = {
  schema_version: 2;
  scenario_name: string;
  baseline_target: string;
  candidate_target: string;
  comparison_mode: ComparisonMode;
  mode_description: string;
  baseline_protocol: string | null;
  candidate_protocol: string | null;
  baseline_client: string | null;
  candidate_client: string | null;
  baseline_state_fingerprint: string | null;
  candidate_state_fingerprint: string | null;
  state_equivalence_status: StateEquivalenceStatus;
  requests_equivalent: boolean;
  control_reason: string | null;
  historical_fork_boundary: boolean;
  mode_override: boolean;
  mode_override_reason: string | null;
  status: ReportStatus;
  conclusion: string;
  warnings: string[];
  definitive_compatibility_claim: boolean;
  probe?: ProbeMetadata;
  resolved_scenario: ScenarioView;
  prepared_requests: ActionPlan[];
  actions: ActionReport[];
  has_findings: boolean;
};

export type FuzzReport = {
  schema_version: 2;
  scenario_name: string;
  comparison_mode: ComparisonMode;
  seed: number;
  cases: Array<{ index: number; mutations: AppliedMutation[]; report: RunReport }>;
  finding_count: number;
  inconclusive_count: number;
};
