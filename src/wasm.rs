use wasm_bindgen::prelude::*;

use std::collections::BTreeMap;

use crate::{
    ActionExecution, ActionPlan, ActionReport, Comparison, FuzzCaseExecution, FuzzPlan, RunPlan,
    Scenario, compare_values, engine,
};

fn from_js<T: serde::de::DeserializeOwned>(value: JsValue, name: &str) -> Result<T, JsValue> {
    serde_wasm_bindgen::from_value(value)
        .map_err(|error| JsValue::from_str(&format!("{name} is invalid: {error}")))
}

fn to_js<T: serde::Serialize>(value: &T) -> Result<JsValue, JsValue> {
    value
        .serialize(
            &serde_wasm_bindgen::Serializer::new()
                .serialize_maps_as_objects(true)
                .serialize_missing_as_null(true),
        )
        .map_err(|error| JsValue::from_str(&format!("could not encode engine output: {error}")))
}

/// Compare two parsed JSON values in a JavaScript workflow step.
#[wasm_bindgen]
pub fn compare_json(
    baseline: JsValue,
    candidate: JsValue,
    comparison: JsValue,
) -> Result<JsValue, JsValue> {
    let baseline = serde_wasm_bindgen::from_value(baseline)
        .map_err(|error| JsValue::from_str(&format!("baseline is invalid JSON: {error}")))?;
    let candidate = serde_wasm_bindgen::from_value(candidate)
        .map_err(|error| JsValue::from_str(&format!("candidate is invalid JSON: {error}")))?;
    let comparison: Comparison = if comparison.is_undefined() || comparison.is_null() {
        Comparison::default()
    } else {
        serde_wasm_bindgen::from_value(comparison)
            .map_err(|error| JsValue::from_str(&format!("comparison rules are invalid: {error}")))?
    };
    to_js(&compare_values(&baseline, &candidate, &comparison))
}

/// Parse and resolve a YAML scenario with the same core that powers the CLI.
#[wasm_bindgen]
pub fn resolve_scenario(source: &str, inputs: JsValue) -> Result<JsValue, JsValue> {
    let inputs: BTreeMap<String, serde_json::Value> = if inputs.is_undefined() || inputs.is_null() {
        BTreeMap::new()
    } else {
        serde_wasm_bindgen::from_value(inputs)
            .map_err(|error| JsValue::from_str(&format!("scenario inputs are invalid: {error}")))?
    };
    let scenario = Scenario::from_yaml(source)
        .map_err(|error| JsValue::from_str(&error.to_string()))?
        .resolve_inputs(&inputs)
        .map_err(|error| JsValue::from_str(&error.to_string()))?;
    to_js(&scenario)
}

/// Parse and validate a YAML scenario without resolving its declared inputs.
#[wasm_bindgen]
pub fn parse_scenario(source: &str) -> Result<JsValue, JsValue> {
    let scenario =
        Scenario::from_yaml(source).map_err(|error| JsValue::from_str(&error.to_string()))?;
    to_js(&scenario)
}

/// Resolve a scenario and produce the authoritative request plan for a host.
#[wasm_bindgen]
pub fn plan_scenario(source: &str, inputs: JsValue) -> Result<JsValue, JsValue> {
    let inputs: BTreeMap<String, serde_json::Value> = if inputs.is_undefined() || inputs.is_null() {
        BTreeMap::new()
    } else {
        from_js(inputs, "scenario inputs")?
    };
    let scenario = Scenario::from_yaml(source)
        .map_err(|error| JsValue::from_str(&error.to_string()))?
        .resolve_inputs(&inputs)
        .map_err(|error| JsValue::from_str(&error.to_string()))?;
    to_js(
        &engine::plan_scenario(&scenario, engine::RunConfiguration::default())
            .map_err(|error| JsValue::from_str(&error.to_string()))?,
    )
}

/// Resolve a scenario and apply explicit comparison-mode metadata.
#[wasm_bindgen]
pub fn plan_configured_scenario(
    source: &str,
    inputs: JsValue,
    configuration: JsValue,
) -> Result<JsValue, JsValue> {
    let inputs: BTreeMap<String, serde_json::Value> = if inputs.is_undefined() || inputs.is_null() {
        BTreeMap::new()
    } else {
        from_js(inputs, "scenario inputs")?
    };
    let configuration: engine::RunConfiguration = from_js(configuration, "run configuration")?;
    let scenario = Scenario::from_yaml(source)
        .map_err(|error| JsValue::from_str(&error.to_string()))?
        .resolve_inputs(&inputs)
        .map_err(|error| JsValue::from_str(&error.to_string()))?;
    let plan = engine::plan_scenario(&scenario, configuration)
        .map_err(|error| JsValue::from_str(&error.to_string()))?;
    to_js(&plan)
}

#[derive(serde::Deserialize)]
struct FuzzOverrides {
    #[serde(default)]
    cases: u32,
    #[serde(default)]
    seed: Option<u64>,
}

/// Resolve a scenario and produce deterministic fuzz request plans.
#[wasm_bindgen]
pub fn plan_fuzz(source: &str, inputs: JsValue, overrides: JsValue) -> Result<JsValue, JsValue> {
    let inputs: BTreeMap<String, serde_json::Value> = if inputs.is_undefined() || inputs.is_null() {
        BTreeMap::new()
    } else {
        from_js(inputs, "scenario inputs")?
    };
    let overrides: FuzzOverrides = if overrides.is_undefined() || overrides.is_null() {
        FuzzOverrides {
            cases: 0,
            seed: None,
        }
    } else {
        from_js(overrides, "fuzz overrides")?
    };
    let scenario = Scenario::from_yaml(source)
        .map_err(|error| JsValue::from_str(&error.to_string()))?
        .resolve_inputs(&inputs)
        .map_err(|error| JsValue::from_str(&error.to_string()))?;
    let plan = engine::plan_fuzz(
        &scenario,
        overrides.cases,
        overrides.seed,
        engine::RunConfiguration::default(),
    )
    .map_err(|error| JsValue::from_str(&error.to_string()))?;
    to_js(&plan)
}

/// Resolve a fuzz scenario and apply explicit comparison-mode metadata.
#[wasm_bindgen]
pub fn plan_configured_fuzz(
    source: &str,
    inputs: JsValue,
    overrides: JsValue,
    configuration: JsValue,
) -> Result<JsValue, JsValue> {
    let inputs: BTreeMap<String, serde_json::Value> = if inputs.is_undefined() || inputs.is_null() {
        BTreeMap::new()
    } else {
        from_js(inputs, "scenario inputs")?
    };
    let overrides: FuzzOverrides = if overrides.is_undefined() || overrides.is_null() {
        FuzzOverrides {
            cases: 0,
            seed: None,
        }
    } else {
        from_js(overrides, "fuzz overrides")?
    };
    let configuration: engine::RunConfiguration = from_js(configuration, "run configuration")?;
    let scenario = Scenario::from_yaml(source)
        .map_err(|error| JsValue::from_str(&error.to_string()))?
        .resolve_inputs(&inputs)
        .map_err(|error| JsValue::from_str(&error.to_string()))?;
    let plan = engine::plan_fuzz(&scenario, overrides.cases, overrides.seed, configuration)
        .map_err(|error| JsValue::from_str(&error.to_string()))?;
    to_js(&plan)
}

/// Evaluate one host execution with Rust comparison and assertion logic.
#[wasm_bindgen]
pub fn evaluate_action(plan: JsValue, execution: JsValue) -> Result<JsValue, JsValue> {
    let plan: ActionPlan = from_js(plan, "action plan")?;
    let execution: ActionExecution = from_js(execution, "action execution")?;
    let report = engine::evaluate_action(&plan, execution)
        .map_err(|error| JsValue::from_str(&error.to_string()))?;
    to_js(&report)
}

/// Evaluate a complete host run and produce the authoritative report.
#[wasm_bindgen]
pub fn evaluate_run(
    plan: JsValue,
    executions: JsValue,
    baseline_target: &str,
    candidate_target: &str,
) -> Result<JsValue, JsValue> {
    let plan: RunPlan = from_js(plan, "run plan")?;
    let executions: Vec<ActionExecution> = from_js(executions, "action executions")?;
    let report = engine::evaluate_run(&plan, executions, baseline_target, candidate_target)
        .map_err(|error| JsValue::from_str(&error.to_string()))?;
    to_js(&report)
}

/// Build one report from Rust-evaluated action reports.
#[wasm_bindgen]
pub fn build_run_report(
    plan: JsValue,
    actions: JsValue,
    baseline_target: &str,
    candidate_target: &str,
) -> Result<JsValue, JsValue> {
    let plan: RunPlan = from_js(plan, "run plan")?;
    let actions: Vec<ActionReport> = from_js(actions, "action reports")?;
    to_js(&engine::build_run_report(
        &plan,
        actions,
        baseline_target,
        candidate_target,
    ))
}

/// Evaluate complete deterministic fuzz executions and produce the report.
#[wasm_bindgen]
pub fn evaluate_fuzz(
    plan: JsValue,
    executions: JsValue,
    baseline_target: &str,
    candidate_target: &str,
) -> Result<JsValue, JsValue> {
    let plan: FuzzPlan = from_js(plan, "fuzz plan")?;
    let executions: Vec<FuzzCaseExecution> = from_js(executions, "fuzz case executions")?;
    let report = engine::evaluate_fuzz(&plan, executions, baseline_target, candidate_target)
        .map_err(|error| JsValue::from_str(&error.to_string()))?;
    to_js(&report)
}
