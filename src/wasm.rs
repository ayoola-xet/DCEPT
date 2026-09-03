use wasm_bindgen::prelude::*;

use std::collections::BTreeMap;

use crate::{Comparison, Scenario, compare_values};

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
    serde_wasm_bindgen::to_value(&compare_values(&baseline, &candidate, &comparison))
        .map_err(|error| JsValue::from_str(&format!("could not encode differences: {error}")))
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
    serde_wasm_bindgen::to_value(&scenario)
        .map_err(|error| JsValue::from_str(&format!("could not encode resolved scenario: {error}")))
}

/// Parse and validate a YAML scenario without resolving its declared inputs.
#[wasm_bindgen]
pub fn parse_scenario(source: &str) -> Result<JsValue, JsValue> {
    let scenario =
        Scenario::from_yaml(source).map_err(|error| JsValue::from_str(&error.to_string()))?;
    serde_wasm_bindgen::to_value(&scenario)
        .map_err(|error| JsValue::from_str(&format!("could not encode scenario: {error}")))
}
