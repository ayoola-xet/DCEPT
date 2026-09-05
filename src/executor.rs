use std::{collections::BTreeMap, time::Duration};

use reqwest::{Client, Method, Url, header::HeaderMap};
use serde_json::{Value, json};

use crate::{
    Scenario,
    engine::{
        ActionExecution, EngineError, FuzzCaseExecution, FuzzReport, OperationResult, RequestPlan,
        RunConfiguration, RunPlan, RunReport, evaluate_fuzz, evaluate_run, plan_fuzz,
        plan_scenario,
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
    pub configuration: RunConfiguration,
}

impl Default for RunOptions {
    fn default() -> Self {
        Self {
            timeout: Duration::from_secs(30),
            configuration: RunConfiguration::default(),
        }
    }
}

pub async fn execute_scenario(
    scenario: &Scenario,
    targets: &TargetPair,
    options: &RunOptions,
) -> Result<RunReport, EngineError> {
    let plan = plan_scenario(scenario, options.configuration.clone())?;
    execute_run_plan(&plan, targets, options).await
}

async fn execute_run_plan(
    plan: &RunPlan,
    targets: &TargetPair,
    options: &RunOptions,
) -> Result<RunReport, EngineError> {
    let client = Client::builder()
        .timeout(options.timeout)
        .build()
        .expect("a valid reqwest client configuration");
    let mut executions = Vec::with_capacity(plan.actions.len());
    for action in &plan.actions {
        let (baseline, candidate) = tokio::join!(
            execute_request(&client, &action.id, &action.baseline, &targets.baseline),
            execute_request(&client, &action.id, &action.candidate, &targets.candidate),
        );
        executions.push(ActionExecution {
            id: action.id.clone(),
            baseline,
            candidate,
        });
    }
    evaluate_run(
        plan,
        executions,
        targets.baseline.name.clone(),
        targets.candidate.name.clone(),
    )
}

pub async fn execute_fuzz(
    scenario: &Scenario,
    targets: &TargetPair,
    options: &RunOptions,
    cases: u32,
    seed: Option<u64>,
) -> Result<FuzzReport, EngineError> {
    let plan = plan_fuzz(scenario, cases, seed, options.configuration.clone())?;
    let client = Client::builder()
        .timeout(options.timeout)
        .build()
        .expect("a valid reqwest client configuration");
    let mut case_executions = Vec::with_capacity(plan.cases.len());
    for case in &plan.cases {
        let mut actions = Vec::with_capacity(case.plan.actions.len());
        for action in &case.plan.actions {
            let (baseline, candidate) = tokio::join!(
                execute_request(&client, &action.id, &action.baseline, &targets.baseline),
                execute_request(&client, &action.id, &action.candidate, &targets.candidate),
            );
            actions.push(ActionExecution {
                id: action.id.clone(),
                baseline,
                candidate,
            });
        }
        case_executions.push(FuzzCaseExecution {
            index: case.index,
            actions,
        });
    }
    evaluate_fuzz(
        &plan,
        case_executions,
        targets.baseline.name.clone(),
        targets.candidate.name.clone(),
    )
}

/// Remove unrelated actions from a failing scenario. The target pair must be
/// disposable when actions can change state.
pub async fn minimize_actions(
    scenario: &Scenario,
    targets: &TargetPair,
    options: &RunOptions,
) -> Result<Scenario, MinimizationError> {
    if !execute_scenario(scenario, targets, options)
        .await?
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
            .await?
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
    #[error(transparent)]
    Engine(#[from] EngineError),
}

async fn execute_request(
    client: &Client,
    action_id: &str,
    request: &RequestPlan,
    target: &Target,
) -> OperationResult {
    let started = std::time::Instant::now();
    let result = match request {
        RequestPlan::Rpc { method, params } => {
            execute_rpc(client, target, action_id, method, params).await
        }
        RequestPlan::Http {
            method,
            path,
            headers,
            body,
        } => execute_http(client, target, method, path, headers, body.as_ref()).await,
    };
    let duration_ms = u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX);
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
    target: &Target,
    action_id: &str,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    let response = client
        .post(target.url.clone())
        .headers(target.headers.clone())
        .json(&json!({"jsonrpc": "2.0", "id": action_id, "method": method, "params": params}))
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
    target: &Target,
    method: &str,
    path: &str,
    headers: &BTreeMap<String, String>,
    body: Option<&Value>,
) -> Result<Value, String> {
    let url = target
        .url
        .join(path)
        .map_err(|error| format!("invalid HTTP action URL: {error}"))?;
    if url.origin() != target.url.origin() {
        return Err("the HTTP action path cannot change the target host".to_owned());
    }
    let method = Method::from_bytes(method.as_bytes())
        .map_err(|error| format!("invalid HTTP method: {error}"))?;
    let mut request = client.request(method, url).headers(target.headers.clone());
    for (name, value) in headers {
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
