use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;

/// A versioned, source-controlled definition of equivalent target operations.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Scenario {
    #[serde(default = "default_version")]
    pub version: u16,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    pub actions: Vec<Action>,
}

fn default_version() -> u16 {
    1
}

impl Scenario {
    pub fn from_yaml(source: &str) -> Result<Self, ScenarioError> {
        let scenario: Self = serde_yaml::from_str(source)
            .map_err(|error| ScenarioError::InvalidYaml(error.to_string()))?;
        scenario.validate()?;
        Ok(scenario)
    }

    pub fn validate(&self) -> Result<(), ScenarioError> {
        if self.version != 1 {
            return Err(ScenarioError::UnsupportedVersion(self.version));
        }
        if self.name.trim().is_empty() {
            return Err(ScenarioError::MissingName);
        }
        if self.actions.is_empty() {
            return Err(ScenarioError::MissingActions);
        }

        let mut action_ids = std::collections::BTreeSet::new();
        for action in &self.actions {
            let id = action.id();
            if id.trim().is_empty() {
                return Err(ScenarioError::MissingActionId);
            }
            if !action_ids.insert(id) {
                return Err(ScenarioError::DuplicateActionId(id.to_owned()));
            }
            action.validate()?;
        }
        Ok(())
    }
}

/// A scenario action. `rpc` supports every JSON-RPC method, including trace and
/// raw signed transaction methods. `http` supports downstream compatibility checks.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Action {
    Rpc(RpcAction),
    Http(HttpAction),
}

impl Action {
    pub fn id(&self) -> &str {
        match self {
            Self::Rpc(action) => &action.id,
            Self::Http(action) => &action.id,
        }
    }

    pub fn comparison(&self) -> &Comparison {
        match self {
            Self::Rpc(action) => &action.comparison,
            Self::Http(action) => &action.comparison,
        }
    }

    fn validate(&self) -> Result<(), ScenarioError> {
        match self {
            Self::Rpc(action) if action.method.trim().is_empty() => {
                Err(ScenarioError::MissingRpcMethod(action.id.clone()))
            }
            Self::Http(action) if action.method.trim().is_empty() => {
                Err(ScenarioError::MissingHttpMethod(action.id.clone()))
            }
            Self::Http(action) if !action.path.starts_with('/') => {
                Err(ScenarioError::InvalidHttpPath(action.id.clone()))
            }
            _ => Ok(()),
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct RpcAction {
    pub id: String,
    pub method: String,
    #[serde(default = "empty_array")]
    pub params: Value,
    #[serde(default)]
    pub baseline_params: Option<Value>,
    #[serde(default)]
    pub candidate_params: Option<Value>,
    #[serde(default)]
    pub comparison: Comparison,
}

fn empty_array() -> Value {
    Value::Array(Vec::new())
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct HttpAction {
    pub id: String,
    pub method: String,
    pub path: String,
    #[serde(default)]
    pub baseline_path: Option<String>,
    #[serde(default)]
    pub candidate_path: Option<String>,
    #[serde(default)]
    pub headers: BTreeMap<String, String>,
    #[serde(default)]
    pub body: Option<Value>,
    #[serde(default)]
    pub baseline_body: Option<Value>,
    #[serde(default)]
    pub candidate_body: Option<Value>,
    #[serde(default)]
    pub comparison: Comparison,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Comparison {
    /// RFC 6901 JSON pointer paths that do not affect a finding.
    #[serde(default)]
    pub ignore_paths: Vec<String>,
    #[serde(default)]
    pub numeric_tolerances: Vec<NumericTolerance>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct NumericTolerance {
    /// An RFC 6901 JSON pointer path.
    pub path: String,
    /// Allowed absolute difference. Decimal JSON numbers and Ethereum hex quantities work.
    pub absolute: f64,
}

#[derive(Debug, Error)]
pub enum ScenarioError {
    #[error("scenario YAML is invalid: {0}")]
    InvalidYaml(String),
    #[error("scenario version {0} is not supported")]
    UnsupportedVersion(u16),
    #[error("scenario name is required")]
    MissingName,
    #[error("scenario must contain at least one action")]
    MissingActions,
    #[error("each action needs an id")]
    MissingActionId,
    #[error("action id '{0}' is duplicated")]
    DuplicateActionId(String),
    #[error("RPC action '{0}' needs a method")]
    MissingRpcMethod(String),
    #[error("HTTP action '{0}' needs a method")]
    MissingHttpMethod(String),
    #[error("HTTP action '{0}' must use a path that starts with '/'")]
    InvalidHttpPath(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_generic_rpc_scenario() {
        let scenario = Scenario::from_yaml(
            r#"
version: 1
name: latest-block
actions:
  - kind: rpc
    id: block
    method: eth_getBlockByNumber
    params: ["latest", false]
"#,
        )
        .expect("valid scenario");

        assert_eq!(scenario.actions.len(), 1);
        assert_eq!(scenario.actions[0].id(), "block");
    }

    #[test]
    fn rejects_duplicate_action_ids() {
        let result = Scenario::from_yaml(
            r#"
name: duplicated
actions:
  - kind: rpc
    id: one
    method: eth_chainId
  - kind: http
    id: one
    method: GET
    path: /health
"#,
        );

        assert!(matches!(result, Err(ScenarioError::DuplicateActionId(_))));
    }
}
