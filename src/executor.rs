use std::{collections::BTreeMap, time::Duration};

use reqwest::{Client, Method, Url, header::HeaderMap};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    compare_values,
    scenario::{Action, HttpAction, RpcAction, Scenario},
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
    pub actions: Vec<ActionReport>,
    pub has_findings: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionReport {
    pub id: String,
    pub baseline: OperationResult,
    pub candidate: OperationResult,
    pub diffs: Vec<crate::compare::Diff>,
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
        actions.push(ActionReport {
            id: action.id().to_owned(),
            baseline,
            candidate,
            diffs,
        });
    }

    let has_findings = actions.iter().any(|action| !action.diffs.is_empty());
    RunReport {
        schema_version: 1,
        scenario_name: scenario.name.clone(),
        baseline_target: targets.baseline.name.clone(),
        candidate_target: targets.candidate.name.clone(),
        actions,
        has_findings,
    }
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
}
