use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use thiserror::Error;

use crate::{
    compare_values,
    scenario::{
        Action, AppliedMutation, Comparison, FuzzCase, ProbeMetadata, ResponseAssertion, Scenario,
        TargetExpectations,
    },
};

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ComparisonMode {
    #[default]
    UpgradeDifferential,
    ClientDifferential,
    Control,
}

impl ComparisonMode {
    pub fn report_language(self) -> &'static str {
        match self {
            Self::UpgradeDifferential => {
                "Baseline protocol behavior vs candidate protocol behavior."
            }
            Self::ClientDifferential => {
                "Implementation consistency under equivalent protocol rules."
            }
            Self::Control => "Product/self-test with intentionally different inputs or conditions.",
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum StateEquivalenceStatus {
    Verified,
    Unverified,
    Mismatched,
    NotApplicable,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ReportStatus {
    Matched,
    Findings,
    Inconclusive,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default, deny_unknown_fields)]
pub struct RunConfiguration {
    pub comparison_mode: ComparisonMode,
    pub baseline_protocol: Option<String>,
    pub candidate_protocol: Option<String>,
    pub baseline_client: Option<String>,
    pub candidate_client: Option<String>,
    pub baseline_state_fingerprint: Option<String>,
    pub candidate_state_fingerprint: Option<String>,
    pub control_reason: Option<String>,
    pub same_target: bool,
    pub allow_mode_override: bool,
    pub mode_override_reason: Option<String>,
    pub historical_fork_boundary: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RunPlan {
    pub schema_version: u16,
    pub scenario_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub probe: Option<ProbeMetadata>,
    pub run_configuration: RunConfiguration,
    pub state_equivalence_status: StateEquivalenceStatus,
    pub requests_equivalent: bool,
    pub resolved_scenario: Scenario,
    pub actions: Vec<ActionPlan>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ActionPlan {
    pub id: String,
    pub baseline: RequestPlan,
    pub candidate: RequestPlan,
    pub comparison: Comparison,
    pub expect: TargetExpectations,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum RequestPlan {
    Rpc {
        method: String,
        params: Value,
    },
    Http {
        method: String,
        path: String,
        headers: std::collections::BTreeMap<String, String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        body: Option<Value>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FuzzPlan {
    pub schema_version: u16,
    pub scenario_name: String,
    pub seed: u64,
    pub cases: Vec<FuzzCasePlan>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FuzzCasePlan {
    pub index: u32,
    pub mutations: Vec<AppliedMutation>,
    pub plan: RunPlan,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ActionExecution {
    pub id: String,
    pub baseline: OperationResult,
    pub candidate: OperationResult,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FuzzCaseExecution {
    pub index: u32,
    pub actions: Vec<ActionExecution>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RunReport {
    pub schema_version: u16,
    pub scenario_name: String,
    pub baseline_target: String,
    pub candidate_target: String,
    pub comparison_mode: ComparisonMode,
    pub mode_description: String,
    pub baseline_protocol: Option<String>,
    pub candidate_protocol: Option<String>,
    pub baseline_client: Option<String>,
    pub candidate_client: Option<String>,
    pub baseline_state_fingerprint: Option<String>,
    pub candidate_state_fingerprint: Option<String>,
    pub state_equivalence_status: StateEquivalenceStatus,
    pub requests_equivalent: bool,
    pub control_reason: Option<String>,
    pub historical_fork_boundary: bool,
    pub mode_override: bool,
    pub mode_override_reason: Option<String>,
    pub status: ReportStatus,
    pub conclusion: String,
    pub warnings: Vec<String>,
    pub definitive_compatibility_claim: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub probe: Option<ProbeMetadata>,
    pub resolved_scenario: Scenario,
    pub prepared_requests: Vec<ActionPlan>,
    pub actions: Vec<ActionReport>,
    pub has_findings: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FuzzReport {
    pub schema_version: u16,
    pub scenario_name: String,
    pub comparison_mode: ComparisonMode,
    pub seed: u64,
    pub cases: Vec<FuzzCaseReport>,
    pub finding_count: usize,
    pub inconclusive_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FuzzCaseReport {
    pub index: u32,
    pub mutations: Vec<AppliedMutationReport>,
    pub report: RunReport,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AppliedMutationReport {
    pub action: String,
    pub scope: crate::scenario::TargetScope,
    pub path: String,
    pub value: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ActionReport {
    pub id: String,
    pub baseline: OperationResult,
    pub candidate: OperationResult,
    pub normalized_baseline: Option<Value>,
    pub normalized_candidate: Option<Value>,
    pub diffs: Vec<crate::compare::Diff>,
    pub assertion_failures: Vec<AssertionFailure>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AssertionFailure {
    pub target: String,
    pub path: String,
    pub rule: String,
    pub expected: Value,
    pub actual: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct OperationResult {
    pub response: Option<Value>,
    pub error: Option<String>,
    pub duration_ms: u64,
}

impl OperationResult {
    pub fn failure(error: impl ToString, duration_ms: u64) -> Self {
        Self {
            response: None,
            error: Some(error.to_string()),
            duration_ms,
        }
    }
}

pub fn plan_scenario(
    scenario: &Scenario,
    configuration: RunConfiguration,
) -> Result<RunPlan, EngineError> {
    validate_configuration(&configuration)?;
    let state_equivalence_status = state_equivalence_status(&configuration);
    let actions = scenario.actions.iter().map(plan_action).collect::<Vec<_>>();
    let requests_equivalent = actions
        .iter()
        .all(|action| action.baseline == action.candidate);
    Ok(RunPlan {
        schema_version: 2,
        scenario_name: scenario.name.clone(),
        probe: scenario.probe.clone(),
        run_configuration: configuration,
        state_equivalence_status,
        requests_equivalent,
        resolved_scenario: scenario.clone(),
        actions,
    })
}

pub fn plan_fuzz(
    scenario: &Scenario,
    cases: u32,
    seed: Option<u64>,
    configuration: RunConfiguration,
) -> Result<FuzzPlan, EngineError> {
    validate_configuration(&configuration)?;
    let configured_seed = scenario
        .fuzz
        .as_ref()
        .and_then(|config| config.seed)
        .unwrap_or(0);
    let seed = seed.unwrap_or(configured_seed);
    let cases = scenario
        .fuzz_cases(cases, seed)?
        .into_iter()
        .map(
            |FuzzCase {
                 index,
                 scenario,
                 mutations,
             }| {
                Ok(FuzzCasePlan {
                    index,
                    mutations,
                    plan: plan_scenario(&scenario, configuration.clone())?,
                })
            },
        )
        .collect::<Result<Vec<_>, EngineError>>()?;
    Ok(FuzzPlan {
        schema_version: 2,
        scenario_name: scenario.name.clone(),
        seed,
        cases,
    })
}

fn validate_configuration(configuration: &RunConfiguration) -> Result<(), EngineError> {
    let override_reason = configuration
        .mode_override_reason
        .as_deref()
        .map(str::trim)
        .filter(|reason| !reason.is_empty());
    if configuration.allow_mode_override && override_reason.is_none() {
        return Err(EngineError::MissingModeOverrideReason);
    }
    if configuration.comparison_mode == ComparisonMode::Control
        && configuration
            .control_reason
            .as_deref()
            .map(str::trim)
            .filter(|reason| !reason.is_empty())
            .is_none()
    {
        return Err(EngineError::MissingControlReason);
    }
    let protocols_match = match (
        configuration.baseline_protocol.as_deref(),
        configuration.candidate_protocol.as_deref(),
    ) {
        (Some(baseline), Some(candidate)) => baseline.trim() == candidate.trim(),
        (None, None) => true,
        _ => false,
    };
    if configuration.comparison_mode == ComparisonMode::UpgradeDifferential
        && !configuration.allow_mode_override
        && !configuration.historical_fork_boundary
        && ((configuration.same_target && protocols_match)
            || (configuration.baseline_protocol.is_some() && protocols_match))
    {
        return Err(EngineError::UpgradeModeIdentityConflict);
    }
    if configuration.comparison_mode == ComparisonMode::ClientDifferential
        && !configuration.allow_mode_override
        && configuration.baseline_protocol.is_some()
        && configuration.candidate_protocol.is_some()
        && !protocols_match
    {
        return Err(EngineError::ClientModeProtocolConflict);
    }
    Ok(())
}

fn state_equivalence_status(configuration: &RunConfiguration) -> StateEquivalenceStatus {
    if configuration.comparison_mode == ComparisonMode::Control {
        return StateEquivalenceStatus::NotApplicable;
    }
    if configuration.allow_mode_override {
        return StateEquivalenceStatus::Unverified;
    }
    match (
        configuration.baseline_state_fingerprint.as_deref(),
        configuration.candidate_state_fingerprint.as_deref(),
    ) {
        (Some(baseline), Some(candidate)) if baseline == candidate => {
            StateEquivalenceStatus::Verified
        }
        (Some(_), Some(_)) => StateEquivalenceStatus::Mismatched,
        _ => StateEquivalenceStatus::Unverified,
    }
}

fn plan_action(action: &Action) -> ActionPlan {
    match action {
        Action::Rpc(action) => ActionPlan {
            id: action.id.clone(),
            baseline: RequestPlan::Rpc {
                method: action.method.clone(),
                params: action
                    .baseline_params
                    .clone()
                    .unwrap_or_else(|| action.params.clone()),
            },
            candidate: RequestPlan::Rpc {
                method: action.method.clone(),
                params: action
                    .candidate_params
                    .clone()
                    .unwrap_or_else(|| action.params.clone()),
            },
            comparison: action.comparison.clone(),
            expect: action.expect.clone(),
        },
        Action::Http(action) => ActionPlan {
            id: action.id.clone(),
            baseline: RequestPlan::Http {
                method: action.method.clone(),
                path: action
                    .baseline_path
                    .clone()
                    .unwrap_or_else(|| action.path.clone()),
                headers: action.headers.clone(),
                body: action.baseline_body.clone().or_else(|| action.body.clone()),
            },
            candidate: RequestPlan::Http {
                method: action.method.clone(),
                path: action
                    .candidate_path
                    .clone()
                    .unwrap_or_else(|| action.path.clone()),
                headers: action.headers.clone(),
                body: action
                    .candidate_body
                    .clone()
                    .or_else(|| action.body.clone()),
            },
            comparison: action.comparison.clone(),
            expect: action.expect.clone(),
        },
    }
}

pub fn evaluate_action(
    plan: &ActionPlan,
    execution: ActionExecution,
) -> Result<ActionReport, EngineError> {
    if execution.id != plan.id {
        return Err(EngineError::ActionIdMismatch {
            expected: plan.id.clone(),
            actual: execution.id,
        });
    }
    let normalized_baseline = execution.baseline.response.as_ref().map(normalize_response);
    let normalized_candidate = execution
        .candidate
        .response
        .as_ref()
        .map(normalize_response);
    let diffs = match (&normalized_baseline, &normalized_candidate) {
        (Some(baseline), Some(candidate)) => compare_values(baseline, candidate, &plan.comparison),
        _ if execution.baseline.error == execution.candidate.error => Vec::new(),
        _ => vec![crate::compare::Diff {
            path: String::new(),
            kind: crate::compare::DiffKind::ValueMismatch,
            baseline: normalized_baseline.clone().or_else(|| {
                execution
                    .baseline
                    .error
                    .as_ref()
                    .map(|value| json!({"error": value}))
            }),
            candidate: normalized_candidate.clone().or_else(|| {
                execution
                    .candidate
                    .error
                    .as_ref()
                    .map(|value| json!({"error": value}))
            }),
        }],
    };
    let mut assertion_failures =
        evaluate_assertions("baseline", &execution.baseline, &plan.expect.baseline);
    assertion_failures.extend(evaluate_assertions(
        "candidate",
        &execution.candidate,
        &plan.expect.candidate,
    ));
    Ok(ActionReport {
        id: plan.id.clone(),
        baseline: execution.baseline,
        candidate: execution.candidate,
        normalized_baseline,
        normalized_candidate,
        diffs,
        assertion_failures,
    })
}

fn normalize_response(value: &Value) -> Value {
    match value {
        Value::Array(values) => Value::Array(values.iter().map(normalize_response).collect()),
        Value::Object(values) => {
            let mut normalized = values
                .iter()
                .map(|(key, value)| (key.clone(), normalize_response(value)))
                .collect::<serde_json::Map<_, _>>();
            if normalized.contains_key("jsonrpc") {
                normalized.remove("id");
            }
            Value::Object(normalized)
        }
        _ => value.clone(),
    }
}

pub fn evaluate_run(
    plan: &RunPlan,
    executions: Vec<ActionExecution>,
    baseline_target: impl Into<String>,
    candidate_target: impl Into<String>,
) -> Result<RunReport, EngineError> {
    if executions.len() != plan.actions.len() {
        return Err(EngineError::ActionCountMismatch {
            expected: plan.actions.len(),
            actual: executions.len(),
        });
    }
    let actions = plan
        .actions
        .iter()
        .zip(executions)
        .map(|(action, execution)| evaluate_action(action, execution))
        .collect::<Result<Vec<_>, _>>()?;
    Ok(build_run_report(
        plan,
        actions,
        baseline_target,
        candidate_target,
    ))
}

pub fn build_run_report(
    plan: &RunPlan,
    actions: Vec<ActionReport>,
    baseline_target: impl Into<String>,
    candidate_target: impl Into<String>,
) -> RunReport {
    let has_findings = actions
        .iter()
        .any(|action| !action.diffs.is_empty() || !action.assertion_failures.is_empty());
    let comparable = (plan.state_equivalence_status == StateEquivalenceStatus::Verified
        && plan.requests_equivalent)
        || (plan.run_configuration.comparison_mode == ComparisonMode::UpgradeDifferential
            && plan.run_configuration.historical_fork_boundary);
    let status = match plan.run_configuration.comparison_mode {
        ComparisonMode::Control => {
            if has_findings {
                ReportStatus::Findings
            } else {
                ReportStatus::Matched
            }
        }
        ComparisonMode::UpgradeDifferential | ComparisonMode::ClientDifferential if !comparable => {
            ReportStatus::Inconclusive
        }
        _ if has_findings => ReportStatus::Findings,
        _ => ReportStatus::Matched,
    };
    let definitive_compatibility_claim = plan.run_configuration.comparison_mode
        != ComparisonMode::Control
        && status != ReportStatus::Inconclusive;
    let mut warnings = Vec::new();
    if plan.run_configuration.comparison_mode != ComparisonMode::Control && !comparable {
        warnings.push(match plan.state_equivalence_status {
            StateEquivalenceStatus::Mismatched => "The starting-state fingerprints do not match. Observed differences can come from unrelated chain state.".to_owned(),
            _ => "DCEPT did not verify equivalent starting state. Observed differences can come from unrelated chain state.".to_owned(),
        });
    }
    if plan.run_configuration.comparison_mode != ComparisonMode::Control
        && !plan.requests_equivalent
        && !plan.run_configuration.historical_fork_boundary
    {
        warnings.push("The prepared baseline and candidate requests are not equivalent. Observed differences can come from different inputs.".to_owned());
    }
    if plan.run_configuration.allow_mode_override {
        warnings.push(format!(
            "The user overrode mode protection: {}",
            plan.run_configuration
                .mode_override_reason
                .as_deref()
                .unwrap_or("no reason supplied")
        ));
    }
    if plan.run_configuration.comparison_mode == ComparisonMode::Control {
        warnings.push("This result is not a controlled upgrade-differential result and does not test client conformance.".to_owned());
    }
    let conclusion = conclusion(plan.run_configuration.comparison_mode, status, has_findings);
    RunReport {
        schema_version: 2,
        scenario_name: plan.scenario_name.clone(),
        baseline_target: baseline_target.into(),
        candidate_target: candidate_target.into(),
        comparison_mode: plan.run_configuration.comparison_mode,
        mode_description: plan
            .run_configuration
            .comparison_mode
            .report_language()
            .to_owned(),
        baseline_protocol: plan.run_configuration.baseline_protocol.clone(),
        candidate_protocol: plan.run_configuration.candidate_protocol.clone(),
        baseline_client: plan.run_configuration.baseline_client.clone(),
        candidate_client: plan.run_configuration.candidate_client.clone(),
        baseline_state_fingerprint: plan.run_configuration.baseline_state_fingerprint.clone(),
        candidate_state_fingerprint: plan.run_configuration.candidate_state_fingerprint.clone(),
        state_equivalence_status: plan.state_equivalence_status,
        requests_equivalent: plan.requests_equivalent,
        control_reason: plan.run_configuration.control_reason.clone(),
        historical_fork_boundary: plan.run_configuration.historical_fork_boundary,
        mode_override: plan.run_configuration.allow_mode_override,
        mode_override_reason: plan.run_configuration.mode_override_reason.clone(),
        status,
        conclusion,
        warnings,
        definitive_compatibility_claim,
        probe: plan.probe.clone(),
        resolved_scenario: plan.resolved_scenario.clone(),
        prepared_requests: plan.actions.clone(),
        actions,
        has_findings,
    }
}

fn conclusion(mode: ComparisonMode, status: ReportStatus, has_findings: bool) -> String {
    match (mode, status, has_findings) {
        (ComparisonMode::UpgradeDifferential, ReportStatus::Inconclusive, _) => "The upgrade differential is inconclusive because equivalent starting state and logical requests were not established. No protocol regression or compatibility failure is claimed.".to_owned(),
        (ComparisonMode::UpgradeDifferential, ReportStatus::Findings, true) => "The controlled baseline protocol behavior differs from the candidate protocol behavior.".to_owned(),
        (ComparisonMode::UpgradeDifferential, ReportStatus::Matched, false) => "The controlled baseline and candidate protocol behaviors match for this scenario.".to_owned(),
        (ComparisonMode::ClientDifferential, ReportStatus::Inconclusive, _) => "The client differential is inconclusive because equivalent starting state and logical requests were not established. No implementation inconsistency is claimed.".to_owned(),
        (ComparisonMode::ClientDifferential, ReportStatus::Findings, true) => "The client implementations differ under equivalent protocol rules.".to_owned(),
        (ComparisonMode::ClientDifferential, ReportStatus::Matched, false) => "The client implementations match under equivalent protocol rules for this scenario.".to_owned(),
        (ComparisonMode::Control, ReportStatus::Findings, true) => "The control detected the intentionally different behavior. This is a DCEPT product self-test.".to_owned(),
        (ComparisonMode::Control, ReportStatus::Matched, false) => "The control inputs produced matching behavior. No protocol difference is claimed.".to_owned(),
        _ => "The run completed without a definitive compatibility conclusion.".to_owned(),
    }
}

pub fn evaluate_fuzz(
    plan: &FuzzPlan,
    executions: Vec<FuzzCaseExecution>,
    baseline_target: impl Into<String> + Clone,
    candidate_target: impl Into<String> + Clone,
) -> Result<FuzzReport, EngineError> {
    if executions.len() != plan.cases.len() {
        return Err(EngineError::FuzzCaseCountMismatch {
            expected: plan.cases.len(),
            actual: executions.len(),
        });
    }
    let cases = plan
        .cases
        .iter()
        .zip(executions)
        .map(|(case, execution)| {
            if case.index != execution.index {
                return Err(EngineError::FuzzCaseIndexMismatch {
                    expected: case.index,
                    actual: execution.index,
                });
            }
            let report = evaluate_run(
                &case.plan,
                execution.actions,
                baseline_target.clone(),
                candidate_target.clone(),
            )?;
            Ok(FuzzCaseReport {
                index: case.index,
                mutations: case
                    .mutations
                    .iter()
                    .cloned()
                    .map(AppliedMutationReport::from)
                    .collect(),
                report,
            })
        })
        .collect::<Result<Vec<_>, EngineError>>()?;
    let finding_count = cases
        .iter()
        .filter(|case| case.report.status == ReportStatus::Findings)
        .count();
    let inconclusive_count = cases
        .iter()
        .filter(|case| case.report.status == ReportStatus::Inconclusive)
        .count();
    Ok(FuzzReport {
        schema_version: 2,
        scenario_name: plan.scenario_name.clone(),
        comparison_mode: plan
            .cases
            .first()
            .map(|case| case.plan.run_configuration.comparison_mode)
            .unwrap_or_default(),
        seed: plan.seed,
        cases,
        finding_count,
        inconclusive_count,
    })
}

impl From<AppliedMutation> for AppliedMutationReport {
    fn from(value: AppliedMutation) -> Self {
        Self {
            action: value.action,
            scope: value.scope,
            path: value.path,
            value: value.value,
        }
    }
}

fn evaluate_assertions(
    target: &str,
    operation: &OperationResult,
    assertions: &[ResponseAssertion],
) -> Vec<AssertionFailure> {
    let mut failures = Vec::new();
    for assertion in assertions {
        let actual = operation
            .response
            .as_ref()
            .and_then(|response| response.pointer(&assertion.path))
            .cloned();
        if let Some(expected) = &assertion.equals {
            if actual.as_ref() != Some(expected) {
                failures.push(AssertionFailure {
                    target: target.to_owned(),
                    path: assertion.path.clone(),
                    rule: "equals".to_owned(),
                    expected: expected.clone(),
                    actual,
                });
            }
            continue;
        }
        for required in &assertion.contains_all {
            let contains = actual.as_ref().is_some_and(|value| match value {
                Value::Array(values) => values.contains(required),
                Value::String(value) => required
                    .as_str()
                    .is_some_and(|required| value.contains(required)),
                _ => false,
            });
            if !contains {
                failures.push(AssertionFailure {
                    target: target.to_owned(),
                    path: assertion.path.clone(),
                    rule: "contains_all".to_owned(),
                    expected: required.clone(),
                    actual: actual.clone(),
                });
            }
        }
        for required in &assertion.has_keys {
            let contains = actual.as_ref().is_some_and(|value| {
                value
                    .as_object()
                    .is_some_and(|object| object.contains_key(required))
            });
            if !contains {
                failures.push(AssertionFailure {
                    target: target.to_owned(),
                    path: assertion.path.clone(),
                    rule: "has_keys".to_owned(),
                    expected: Value::String(required.clone()),
                    actual: actual.clone(),
                });
            }
        }
        if assertion.is_hex_quantity {
            let valid = actual
                .as_ref()
                .and_then(Value::as_str)
                .is_some_and(|value| {
                    value.starts_with("0x")
                        && value.len() > 2
                        && value[2..].bytes().all(|byte| byte.is_ascii_hexdigit())
                });
            if !valid {
                failures.push(AssertionFailure {
                    target: target.to_owned(),
                    path: assertion.path.clone(),
                    rule: "is_hex_quantity".to_owned(),
                    expected: Value::Bool(true),
                    actual,
                });
            }
        }
    }
    failures
}

#[derive(Debug, Error)]
pub enum EngineError {
    #[error("the engine expected {expected} action results but received {actual}")]
    ActionCountMismatch { expected: usize, actual: usize },
    #[error("the engine expected action '{expected}' but received '{actual}'")]
    ActionIdMismatch { expected: String, actual: String },
    #[error("the engine expected {expected} fuzz case results but received {actual}")]
    FuzzCaseCountMismatch { expected: usize, actual: usize },
    #[error("the engine expected fuzz case {expected} but received {actual}")]
    FuzzCaseIndexMismatch { expected: u32, actual: u32 },
    #[error("control mode requires a control reason")]
    MissingControlReason,
    #[error("a mode override requires a reason")]
    MissingModeOverrideReason,
    #[error(
        "upgrade_differential mode cannot use an identical target and protocol identity unless the user records an override"
    )]
    UpgradeModeIdentityConflict,
    #[error(
        "client_differential mode requires equivalent protocol identities unless the user records an override"
    )]
    ClientModeProtocolConflict,
    #[error(transparent)]
    Scenario(#[from] crate::scenario::ScenarioError),
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Scenario;

    fn scenario(candidate_params: bool) -> Scenario {
        Scenario::from_yaml(&format!(
            r#"
version: 1
name: engine-test
actions:
  - kind: rpc
    id: check
    method: test_echo
    params: [{{value: 1}}]
{}
    expect:
      baseline:
        - path: /result/ok
          equals: true
      candidate:
        - path: /result/ok
          equals: true
"#,
            if candidate_params {
                "    candidate_params: [{value: 2}]"
            } else {
                ""
            }
        ))
        .expect("scenario parses")
    }

    fn control_configuration() -> RunConfiguration {
        RunConfiguration {
            comparison_mode: ComparisonMode::Control,
            control_reason: Some("Verify known behavior.".to_owned()),
            same_target: true,
            ..RunConfiguration::default()
        }
    }

    fn execution(candidate_ok: bool) -> Vec<ActionExecution> {
        vec![ActionExecution {
            id: "check".to_owned(),
            baseline: OperationResult {
                response: Some(json!({"result": {"ok": true}})),
                error: None,
                duration_ms: 1,
            },
            candidate: OperationResult {
                response: Some(json!({"result": {"ok": candidate_ok}})),
                error: None,
                duration_ms: 1,
            },
        }]
    }

    #[test]
    fn control_mode_reports_known_difference_without_upgrade_claim() {
        let plan = plan_scenario(&scenario(true), control_configuration()).expect("plan works");
        let report = evaluate_run(&plan, execution(false), "baseline", "candidate")
            .expect("execution matches the plan");
        assert_eq!(report.comparison_mode, ComparisonMode::Control);
        assert_eq!(report.status, ReportStatus::Findings);
        assert!(report.has_findings);
        assert!(!report.definitive_compatibility_claim);
        assert!(report.warnings[0].contains("not a controlled upgrade-differential"));
        assert_eq!(report.prepared_requests[0], plan.actions[0]);
        assert_eq!(report.actions[0].assertion_failures.len(), 1);
    }

    #[test]
    fn same_input_control_reports_no_protocol_difference() {
        let plan = plan_scenario(&scenario(false), control_configuration()).expect("plan works");
        let report = evaluate_run(&plan, execution(true), "baseline", "candidate")
            .expect("execution matches the plan");
        assert_eq!(report.status, ReportStatus::Matched);
        assert!(!report.has_findings);
        assert!(
            report
                .conclusion
                .contains("No protocol difference is claimed")
        );
    }

    #[test]
    fn unverified_upgrade_state_is_inconclusive() {
        let configuration = RunConfiguration {
            comparison_mode: ComparisonMode::UpgradeDifferential,
            baseline_protocol: Some("osaka".to_owned()),
            candidate_protocol: Some("glamsterdam".to_owned()),
            ..RunConfiguration::default()
        };
        let plan = plan_scenario(&scenario(false), configuration).expect("plan works");
        let report = evaluate_run(&plan, execution(false), "baseline", "candidate")
            .expect("execution matches the plan");
        assert_eq!(report.status, ReportStatus::Inconclusive);
        assert!(!report.definitive_compatibility_claim);
        assert!(report.conclusion.contains("No protocol regression"));
    }

    #[test]
    fn verified_upgrade_state_allows_protocol_finding() {
        let configuration = RunConfiguration {
            comparison_mode: ComparisonMode::UpgradeDifferential,
            baseline_protocol: Some("osaka".to_owned()),
            candidate_protocol: Some("glamsterdam".to_owned()),
            baseline_state_fingerprint: Some("state-1".to_owned()),
            candidate_state_fingerprint: Some("state-1".to_owned()),
            ..RunConfiguration::default()
        };
        let plan = plan_scenario(&scenario(false), configuration).expect("plan works");
        let report = evaluate_run(&plan, execution(false), "baseline", "candidate")
            .expect("execution matches the plan");
        assert_eq!(
            report.state_equivalence_status,
            StateEquivalenceStatus::Verified
        );
        assert_eq!(report.status, ReportStatus::Findings);
        assert!(report.definitive_compatibility_claim);
        assert!(
            report
                .mode_description
                .contains("Baseline protocol behavior")
        );
    }

    #[test]
    fn client_mode_uses_implementation_language() {
        let configuration = RunConfiguration {
            comparison_mode: ComparisonMode::ClientDifferential,
            baseline_protocol: Some("glamsterdam".to_owned()),
            candidate_protocol: Some("glamsterdam".to_owned()),
            baseline_client: Some("geth".to_owned()),
            candidate_client: Some("reth".to_owned()),
            baseline_state_fingerprint: Some("state-1".to_owned()),
            candidate_state_fingerprint: Some("state-1".to_owned()),
            ..RunConfiguration::default()
        };
        let plan = plan_scenario(&scenario(false), configuration).expect("plan works");
        let report = evaluate_run(&plan, execution(false), "geth", "reth")
            .expect("execution matches the plan");
        assert_eq!(report.comparison_mode, ComparisonMode::ClientDifferential);
        assert!(
            report
                .mode_description
                .contains("Implementation consistency")
        );
        assert!(!report.conclusion.contains("pre-vs-post"));
    }

    #[test]
    fn upgrade_mode_rejects_identical_identity_without_override() {
        let configuration = RunConfiguration {
            comparison_mode: ComparisonMode::UpgradeDifferential,
            baseline_protocol: Some("glamsterdam".to_owned()),
            candidate_protocol: Some("glamsterdam".to_owned()),
            same_target: true,
            ..RunConfiguration::default()
        };
        assert!(matches!(
            plan_scenario(&scenario(false), configuration),
            Err(EngineError::UpgradeModeIdentityConflict)
        ));
    }

    #[test]
    fn upgrade_mode_records_explicit_override() {
        let configuration = RunConfiguration {
            comparison_mode: ComparisonMode::UpgradeDifferential,
            baseline_protocol: Some("glamsterdam".to_owned()),
            candidate_protocol: Some("glamsterdam".to_owned()),
            same_target: true,
            allow_mode_override: true,
            mode_override_reason: Some("Exercise a historical endpoint.".to_owned()),
            ..RunConfiguration::default()
        };
        let plan = plan_scenario(&scenario(false), configuration).expect("override is recorded");
        let report = evaluate_run(&plan, execution(true), "baseline", "candidate")
            .expect("execution matches the plan");
        assert!(report.mode_override);
        assert_eq!(report.status, ReportStatus::Inconclusive);
    }
}
