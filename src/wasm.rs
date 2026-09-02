use wasm_bindgen::prelude::*;

use crate::{Comparison, compare_values};

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
