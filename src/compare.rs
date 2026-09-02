use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::scenario::Comparison;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Diff {
    pub path: String,
    pub kind: DiffKind,
    pub baseline: Option<Value>,
    pub candidate: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DiffKind {
    ValueMismatch,
    MissingBaseline,
    MissingCandidate,
    TypeMismatch,
}

pub fn compare_values(baseline: &Value, candidate: &Value, rules: &Comparison) -> Vec<Diff> {
    let mut diffs = Vec::new();
    compare_at("", baseline, candidate, rules, &mut diffs);
    diffs
}

fn compare_at(
    path: &str,
    baseline: &Value,
    candidate: &Value,
    rules: &Comparison,
    diffs: &mut Vec<Diff>,
) {
    if rules.ignore_paths.iter().any(|ignored| ignored == path) {
        return;
    }
    if values_match_with_tolerance(path, baseline, candidate, rules) {
        return;
    }

    match (baseline, candidate) {
        (Value::Object(left), Value::Object(right)) => {
            let keys: std::collections::BTreeSet<_> = left.keys().chain(right.keys()).collect();
            for key in keys {
                let child_path = join_pointer(path, key);
                match (left.get(key), right.get(key)) {
                    (Some(left), Some(right)) => compare_at(&child_path, left, right, rules, diffs),
                    (Some(left), None) => diffs.push(Diff {
                        path: child_path,
                        kind: DiffKind::MissingCandidate,
                        baseline: Some(left.clone()),
                        candidate: None,
                    }),
                    (None, Some(right)) => diffs.push(Diff {
                        path: child_path,
                        kind: DiffKind::MissingBaseline,
                        baseline: None,
                        candidate: Some(right.clone()),
                    }),
                    (None, None) => unreachable!("a key comes from one of the two objects"),
                }
            }
        }
        (Value::Array(left), Value::Array(right)) => {
            let length = left.len().max(right.len());
            for index in 0..length {
                let child_path = join_pointer(path, &index.to_string());
                match (left.get(index), right.get(index)) {
                    (Some(left), Some(right)) => compare_at(&child_path, left, right, rules, diffs),
                    (Some(left), None) => diffs.push(Diff {
                        path: child_path,
                        kind: DiffKind::MissingCandidate,
                        baseline: Some(left.clone()),
                        candidate: None,
                    }),
                    (None, Some(right)) => diffs.push(Diff {
                        path: child_path,
                        kind: DiffKind::MissingBaseline,
                        baseline: None,
                        candidate: Some(right.clone()),
                    }),
                    (None, None) => unreachable!("index is in one of the two arrays"),
                }
            }
        }
        _ if baseline == candidate => {}
        _ => diffs.push(Diff {
            path: path.to_owned(),
            kind: if same_json_type(baseline, candidate) {
                DiffKind::ValueMismatch
            } else {
                DiffKind::TypeMismatch
            },
            baseline: Some(baseline.clone()),
            candidate: Some(candidate.clone()),
        }),
    }
}

fn join_pointer(parent: &str, token: &str) -> String {
    let token = token.replace('~', "~0").replace('/', "~1");
    format!("{parent}/{token}")
}

fn same_json_type(left: &Value, right: &Value) -> bool {
    matches!(
        (left, right),
        (Value::Null, Value::Null)
            | (Value::Bool(_), Value::Bool(_))
            | (Value::Number(_), Value::Number(_))
            | (Value::String(_), Value::String(_))
            | (Value::Array(_), Value::Array(_))
            | (Value::Object(_), Value::Object(_))
    )
}

fn values_match_with_tolerance(
    path: &str,
    left: &Value,
    right: &Value,
    rules: &Comparison,
) -> bool {
    let Some(rule) = rules
        .numeric_tolerances
        .iter()
        .find(|rule| rule.path == path)
    else {
        return false;
    };
    match (numeric_value(left), numeric_value(right)) {
        (Some(left), Some(right)) => (left - right).abs() <= rule.absolute,
        _ => false,
    }
}

fn numeric_value(value: &Value) -> Option<f64> {
    match value {
        Value::Number(number) => number.as_f64(),
        Value::String(text) if text.starts_with("0x") => {
            u128::from_str_radix(text.trim_start_matches("0x"), 16)
                .ok()
                .map(|value| value as f64)
        }
        Value::String(text) => text.parse::<f64>().ok(),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::scenario::NumericTolerance;

    #[test]
    fn ignores_declared_paths() {
        let diffs = compare_values(
            &json!({"result": {"number": "0x1", "hash": "0xaaa"}}),
            &json!({"result": {"number": "0x1", "hash": "0xbbb"}}),
            &Comparison {
                ignore_paths: vec!["/result/hash".to_owned()],
                ..Default::default()
            },
        );

        assert!(diffs.is_empty());
    }

    #[test]
    fn supports_hex_quantity_tolerance() {
        let diffs = compare_values(
            &json!({"gas": "0x5208"}),
            &json!({"gas": "0x520a"}),
            &Comparison {
                numeric_tolerances: vec![NumericTolerance {
                    path: "/gas".to_owned(),
                    absolute: 2.0,
                }],
                ..Default::default()
            },
        );

        assert!(diffs.is_empty());
    }
}
