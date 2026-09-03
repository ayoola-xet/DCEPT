use std::{collections::BTreeMap, time::Duration};

use reqwest::{Client, Method, Url, header::HeaderMap};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    compare_values,
    scenario::{
        Action, FuzzCase, HttpAction, ProbeMetadata, ResponseAssertion, RpcAction, Scenario,
    },
};

#[derive(Debug, Clone)]
pub struct Target {
    pub name: String,
    pub url: Url,
    pub headers: HeaderMap,
}

#[derive(Debug, Clone)]
pub struct TargetPair {
    pub baseline: Target,
    pub candidate: Target,
}

#[derive(Debug, Clone)]
pub struct RunOptions {
    pub timeout: Duration,
}

impl Default for RunOptions {
    fn default() -> Self {
        Self {
            timeout: Duration::from_secs(30),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunReport {
    pub schema_version: u16,
    pub scenario_name: String,
    pub baseline_target: String,
    pub candidate_target: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub probe: Option<ProbeMetadata>,
    pub actions: Vec<ActionReport>,
    pub has_findings: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FuzzReport {
    pub schema_version: u16,
    pub scenario_name: String,
    pub seed: u64,
    pub cases: Vec<FuzzCaseReport>,
    pub finding_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FuzzCaseReport {
    pub index: u32,
    pub mutations: Vec<AppliedMutationReport>,
    pub report: RunReport,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppliedMutationReport {
    pub action: String,
    pub scope: crate::scenario::TargetScope,
    pub path: String,
    pub value: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionReport {
    pub id: String,
    pub baseline: OperationResult,
    pub candidate: OperationResult,
    pub diffs: Vec<crate::compare::Diff>,
    pub assertion_failures: Vec<AssertionFailure>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssertionFailure {
    pub target: String,
    pub path: String,
    pub rule: String,
    pub expected: Value,
    pub actual: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OperationResult {
    pub response: Option<Value>,
    pub error: Option<String>,
    pub duration_ms: u128,
}

impl OperationResult {
    fn failure(error: impl ToString, duration_ms: u128) -> Self {
        Self {
            response: None,
            error: Some(error.to_string()),
            duration_ms,
        }
    }
}

pub async fn execute_scenario(
    scenario: &Scenario,
    targets: &TargetPair,
    options: &RunOptions,
) -> RunReport {
    let client = Client::builder()
        .timeout(options.timeout)
        .build()
        .expect("a valid reqwest client configuration");
    let mut actions = Vec::with_capacity(scenario.actions.len());

    for action in &scenario.actions {
        let (baseline, candidate) = tokio::join!(
            execute_action(&client, action, &targets.baseline, TargetSide::Baseline),
            execute_action(&client, action, &targets.candidate, TargetSide::Candidate),
        );
        let diffs = match (&baseline.response, &candidate.response) {
            (Some(baseline), Some(candidate)) => {
                compare_values(baseline, candidate, action.comparison())
            }
            _ if baseline.error == candidate.error => Vec::new(),
            _ => vec![crate::compare::Diff {
                path: "".to_owned(),
                kind: crate::compare::DiffKind::ValueMismatch,
                baseline: baseline
                    .response
                    .clone()
                    .or_else(|| baseline.error.as_ref().map(|value| json!({"error": value}))),
                candidate: candidate.response.clone().or_else(|| {
                    candidate
                        .error
                        .as_ref()
                        .map(|value| json!({"error": value}))
                }),
            }],
        };
        let mut assertion_failures =
            evaluate_assertions("baseline", &baseline, &action.expectations().baseline);
        assertion_failures.extend(evaluate_assertions(
            "candidate",
            &candidate,
            &action.expectations().candidate,
        ));
        actions.push(ActionReport {
            id: action.id().to_owned(),
            baseline,
            candidate,
            diffs,
            assertion_failures,
        });
    }

    let has_findings = actions
        .iter()
        .any(|action| !action.diffs.is_empty() || !action.assertion_failures.is_empty());
    RunReport {
        schema_version: 1,
        scenario_name: scenario.name.clone(),
        baseline_target: targets.baseline.name.clone(),
        candidate_target: targets.candidate.name.clone(),
        probe: scenario.probe.clone(),
        actions,
        has_findings,
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
                    actual: actual.clone(),
                });
            }
        }
    }
    failures
}

/// Run reproducible generated cases. Cases run in order so that every finding has
/// an unambiguous target history. Use isolated targets for write methods.
pub async fn execute_fuzz(
    scenario: &Scenario,
    targets: &TargetPair,
    options: &RunOptions,
    cases: u32,
    seed: Option<u64>,
) -> Result<FuzzReport, crate::scenario::ScenarioError> {
    let configured_seed = scenario
        .fuzz
        .as_ref()
        .and_then(|config| config.seed)
        .unwrap_or(0);
    let seed = seed.unwrap_or(configured_seed);
    let generated = scenario.fuzz_cases(cases, seed)?;
    let mut reports = Vec::with_capacity(generated.len());
    for FuzzCase {
        index,
        scenario,
        mutations,
    } in generated
    {
        let report = execute_scenario(&scenario, targets, options).await;
        let mutations = mutations
            .into_iter()
            .map(|mutation| AppliedMutationReport {
                action: mutation.action,
                scope: mutation.scope,
                path: mutation.path,
                value: mutation.value,
            })
            .collect();
        reports.push(FuzzCaseReport {
            index,
            mutations,
            report,
        });
    }
    let finding_count = reports
        .iter()
        .filter(|case| case.report.has_findings)
        .count();
    Ok(FuzzReport {
        schema_version: 1,
        scenario_name: scenario.name.clone(),
        seed,
        cases: reports,
        finding_count,
    })
}

/// Remove unrelated actions from a failing scenario. The target pair must be
/// disposable when actions can change state.
pub async fn minimize_actions(
    scenario: &Scenario,
    targets: &TargetPair,
    options: &RunOptions,
) -> Result<Scenario, MinimizationError> {
    if !execute_scenario(scenario, targets, options)
        .await
        .has_findings
    {
        return Err(MinimizationError::NoFinding);
    }
    let mut minimized = scenario.clone();
    minimized.fuzz = None;
    let mut index = 0;
    while index < minimized.actions.len() && minimized.actions.len() > 1 {
        let mut trial = minimized.clone();
        trial.actions.remove(index);
        if execute_scenario(&trial, targets, options)
            .await
            .has_findings
        {
            minimized = trial;
        } else {
            index += 1;
        }
    }
    Ok(minimized)
}

#[derive(Debug, thiserror::Error)]
pub enum MinimizationError {
    #[error("the input scenario has no finding on these targets")]
    NoFinding,
}

#[derive(Clone, Copy)]
enum TargetSide {
    Baseline,
    Candidate,
}

async fn execute_action(
    client: &Client,
    action: &Action,
    target: &Target,
    side: TargetSide,
) -> OperationResult {
    let started = std::time::Instant::now();
    let result = match action {
        Action::Rpc(action) => execute_rpc(client, action, target, side).await,
        Action::Http(action) => execute_http(client, action, target, side).await,
    };
    let duration_ms = started.elapsed().as_millis();
    match result {
        Ok(response) => OperationResult {
            response: Some(response),
            error: None,
            duration_ms,
        },
        Err(error) => OperationResult::failure(error, duration_ms),
    }
}

async fn execute_rpc(
    client: &Client,
    action: &RpcAction,
    target: &Target,
    side: TargetSide,
) -> Result<Value, String> {
    let params = match side {
        TargetSide::Baseline => action.baseline_params.as_ref().unwrap_or(&action.params),
        TargetSide::Candidate => action.candidate_params.as_ref().unwrap_or(&action.params),
    };
    let response = client
        .post(target.url.clone())
        .headers(target.headers.clone())
        .json(
            &json!({"jsonrpc": "2.0", "id": action.id, "method": action.method, "params": params}),
        )
        .send()
        .await
        .map_err(|error| format!("request failed: {error}"))?;
    let status = response.status();
    let body = response
        .json::<Value>()
        .await
        .map_err(|error| format!("JSON-RPC response is not JSON: {error}"))?;
    if !status.is_success() {
        return Err(format!("JSON-RPC endpoint returned HTTP {status}: {body}"));
    }
    Ok(body)
}

async fn execute_http(
    client: &Client,
    action: &HttpAction,
    target: &Target,
    side: TargetSide,
) -> Result<Value, String> {
    let path = match side {
        TargetSide::Baseline => action.baseline_path.as_deref().unwrap_or(&action.path),
        TargetSide::Candidate => action.candidate_path.as_deref().unwrap_or(&action.path),
    };
    let body = match side {
        TargetSide::Baseline => action.baseline_body.as_ref().or(action.body.as_ref()),
        TargetSide::Candidate => action.candidate_body.as_ref().or(action.body.as_ref()),
    };
    let url = target
        .url
        .join(path)
        .map_err(|error| format!("invalid HTTP action URL: {error}"))?;
    let method = Method::from_bytes(action.method.as_bytes())
        .map_err(|error| format!("invalid HTTP method: {error}"))?;
    let mut request = client.request(method, url).headers(target.headers.clone());
    for (name, value) in &action.headers {
        request = request.header(name, value);
    }
    if let Some(body) = body {
        request = request.json(body);
    }
    let response = request
        .send()
        .await
        .map_err(|error| format!("request failed: {error}"))?;
    let status = response.status().as_u16();
    let text = response
        .text()
        .await
        .map_err(|error| format!("response body read failed: {error}"))?;
    let body = serde_json::from_str(&text).unwrap_or(Value::String(text));
    Ok(json!({"status": status, "body": body}))
}

pub fn headers_from_pairs(pairs: &[String]) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    for pair in pairs {
        let (name, value) = pair
            .split_once(':')
            .ok_or_else(|| format!("header '{pair}' must use NAME:VALUE"))?;
        let name = reqwest::header::HeaderName::from_bytes(name.trim().as_bytes())
            .map_err(|error| format!("invalid header name '{name}': {error}"))?;
        let value = reqwest::header::HeaderValue::from_str(value.trim())
            .map_err(|error| format!("invalid header value for '{name}': {error}"))?;
        headers.insert(name, value);
    }
    Ok(headers)
}

pub fn named_headers(headers: BTreeMap<String, String>) -> Result<HeaderMap, String> {
    headers_from_pairs(
        &headers
            .into_iter()
            .map(|(name, value)| format!("{name}:{value}"))
            .collect::<Vec<_>>(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_header_pairs() {
        let headers = headers_from_pairs(&["Authorization: Bearer token".to_owned()])
            .expect("header is valid");
        assert_eq!(
            headers
                .get("authorization")
                .and_then(|value| value.to_str().ok()),
            Some("Bearer token")
        );
    }

    #[test]
    fn reports_a_missing_required_engine_capability() {
        let operation = OperationResult {
            response: Some(json!({"result": ["engine_newPayloadV4"]})),
            error: None,
            duration_ms: 1,
        };
        let assertions = vec![ResponseAssertion {
            path: "/result".to_owned(),
            equals: None,
            contains_all: vec![json!("engine_newPayloadV5")],
            has_keys: Vec::new(),
            is_hex_quantity: false,
        }];
        let failures = evaluate_assertions("candidate", &operation, &assertions);
        assert_eq!(failures.len(), 1);
        assert_eq!(failures[0].target, "candidate");
        assert_eq!(failures[0].rule, "contains_all");
    }

    #[test]
    fn reports_a_missing_required_payload_body_key() {
        let operation = OperationResult {
            response: Some(json!({"result": [{}]})),
            error: None,
            duration_ms: 1,
        };
        let assertions = vec![ResponseAssertion {
            path: "/result/0".to_owned(),
            equals: None,
            contains_all: Vec::new(),
            has_keys: vec!["blockAccessList".to_owned()],
            is_hex_quantity: false,
        }];
        let failures = evaluate_assertions("baseline", &operation, &assertions);
        assert_eq!(failures.len(), 1);
        assert_eq!(failures[0].rule, "has_keys");
    }

    #[test]
    fn reports_a_non_quantity_result() {
        let operation = OperationResult {
            response: Some(json!({"result": "not-a-quantity"})),
            error: None,
            duration_ms: 1,
        };
        let assertions = vec![ResponseAssertion {
            path: "/result".to_owned(),
            equals: None,
            contains_all: Vec::new(),
            has_keys: Vec::new(),
            is_hex_quantity: true,
        }];
        let failures = evaluate_assertions("candidate", &operation, &assertions);
        assert_eq!(failures.len(), 1);
        assert_eq!(failures[0].rule, "is_hex_quantity");
    }
}
