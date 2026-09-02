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
    #[serde(default)]
    pub fuzz: Option<FuzzConfig>,
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
        if let Some(fuzz) = &self.fuzz {
            fuzz.validate(self)?;
        }
        Ok(())
    }

    /// Create reproducible scenario variants from this scenario's fuzz definition.
    pub fn fuzz_cases(&self, cases: u32, seed: u64) -> Result<Vec<FuzzCase>, ScenarioError> {
        let fuzz = self
            .fuzz
            .as_ref()
            .ok_or(ScenarioError::MissingFuzzConfiguration)?;
        let case_count = if cases == 0 { fuzz.cases } else { cases };
        if case_count == 0 {
            return Err(ScenarioError::InvalidFuzzCaseCount);
        }

        let mut generator = DeterministicGenerator::new(seed);
        let mut output = Vec::with_capacity(case_count as usize);
        for index in 0..case_count {
            let mut scenario = self.clone();
            scenario.fuzz = None;
            let mut mutations = Vec::with_capacity(fuzz.mutations.len());
            for mutation in &fuzz.mutations {
                let value = mutation.values[generator.index(mutation.values.len())].clone();
                scenario.apply_mutation(mutation, value.clone())?;
                mutations.push(AppliedMutation {
                    action: mutation.action.clone(),
                    scope: mutation.scope,
                    path: mutation.path.clone(),
                    value,
                });
            }
            output.push(FuzzCase {
                index,
                scenario,
                mutations,
            });
        }
        Ok(output)
    }

    fn apply_mutation(
        &mut self,
        mutation: &FuzzMutation,
        value: Value,
    ) -> Result<(), ScenarioError> {
        let action = self
            .actions
            .iter_mut()
            .find(|action| action.id() == mutation.action)
            .ok_or_else(|| ScenarioError::UnknownFuzzAction(mutation.action.clone()))?;
        let Action::Rpc(action) = action else {
            return Err(ScenarioError::FuzzActionIsNotRpc(mutation.action.clone()));
        };
        match mutation.scope {
            TargetScope::Both => set_pointer(&mut action.params, &mutation.path, value),
            TargetScope::Baseline => {
                let params = action
                    .baseline_params
                    .get_or_insert_with(|| action.params.clone());
                set_pointer(params, &mutation.path, value)
            }
            TargetScope::Candidate => {
                let params = action
                    .candidate_params
                    .get_or_insert_with(|| action.params.clone());
                set_pointer(params, &mutation.path, value)
            }
        }
        .map_err(|error| ScenarioError::InvalidFuzzPath {
            action: mutation.action.clone(),
            path: mutation.path.clone(),
            reason: error,
        })
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

/// Declarative input values for deterministic compatibility fuzzing.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct FuzzConfig {
    #[serde(default = "default_fuzz_cases")]
    pub cases: u32,
    #[serde(default)]
    pub seed: Option<u64>,
    pub mutations: Vec<FuzzMutation>,
}

fn default_fuzz_cases() -> u32 {
    100
}

impl FuzzConfig {
    fn validate(&self, scenario: &Scenario) -> Result<(), ScenarioError> {
        if self.cases == 0 {
            return Err(ScenarioError::InvalidFuzzCaseCount);
        }
        if self.mutations.is_empty() {
            return Err(ScenarioError::MissingFuzzMutations);
        }
        for mutation in &self.mutations {
            if mutation.values.is_empty() {
                return Err(ScenarioError::MissingFuzzValues(mutation.action.clone()));
            }
            let action = scenario
                .actions
                .iter()
                .find(|action| action.id() == mutation.action)
                .ok_or_else(|| ScenarioError::UnknownFuzzAction(mutation.action.clone()))?;
            if !matches!(action, Action::Rpc(_)) {
                return Err(ScenarioError::FuzzActionIsNotRpc(mutation.action.clone()));
            }
            if !mutation.path.starts_with('/') {
                return Err(ScenarioError::InvalidFuzzPath {
                    action: mutation.action.clone(),
                    path: mutation.path.clone(),
                    reason: "the path must start with '/'".to_owned(),
                });
            }
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct FuzzMutation {
    pub action: String,
    /// RFC 6901 pointer inside the JSON-RPC params value.
    pub path: String,
    #[serde(default)]
    pub scope: TargetScope,
    pub values: Vec<Value>,
}

#[derive(Debug, Clone, Copy, Default, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TargetScope {
    #[default]
    Both,
    Baseline,
    Candidate,
}

#[derive(Debug, Clone, Serialize)]
pub struct FuzzCase {
    pub index: u32,
    pub scenario: Scenario,
    pub mutations: Vec<AppliedMutation>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AppliedMutation {
    pub action: String,
    pub scope: TargetScope,
    pub path: String,
    pub value: Value,
}

struct DeterministicGenerator {
    state: u64,
}

impl DeterministicGenerator {
    fn new(seed: u64) -> Self {
        Self { state: seed }
    }

    fn index(&mut self, length: usize) -> usize {
        self.state = self
            .state
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        (self.state as usize) % length
    }
}

fn set_pointer(value: &mut Value, path: &str, replacement: Value) -> Result<(), String> {
    let tokens = path
        .strip_prefix('/')
        .ok_or_else(|| "the path must start with '/'".to_owned())?
        .split('/')
        .map(|token| token.replace("~1", "/").replace("~0", "~"))
        .collect::<Vec<_>>();
    let (last, parents) = tokens
        .split_last()
        .ok_or_else(|| "the root value cannot be replaced".to_owned())?;
    let mut current = value;
    for token in parents {
        current = match current {
            Value::Object(object) => object
                .get_mut(token)
                .ok_or_else(|| format!("object key '{token}' does not exist"))?,
            Value::Array(array) => {
                let index = token
                    .parse::<usize>()
                    .map_err(|_| format!("array index '{token}' is invalid"))?;
                array
                    .get_mut(index)
                    .ok_or_else(|| format!("array index '{index}' does not exist"))?
            }
            _ => return Err(format!("'{token}' does not address an object or array")),
        };
    }
    match current {
        Value::Object(object) => {
            if !object.contains_key(last) {
                return Err(format!("object key '{last}' does not exist"));
            }
            object.insert(last.to_owned(), replacement);
        }
        Value::Array(array) => {
            let index = last
                .parse::<usize>()
                .map_err(|_| format!("array index '{last}' is invalid"))?;
            let slot = array
                .get_mut(index)
                .ok_or_else(|| format!("array index '{index}' does not exist"))?;
            *slot = replacement;
        }
        _ => return Err("the parent value is not an object or array".to_owned()),
    }
    Ok(())
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
    #[error("fuzz configuration is required")]
    MissingFuzzConfiguration,
    #[error("fuzz cases must be greater than zero")]
    InvalidFuzzCaseCount,
    #[error("fuzz configuration needs at least one mutation")]
    MissingFuzzMutations,
    #[error("fuzz mutation for action '{0}' needs at least one value")]
    MissingFuzzValues(String),
    #[error("fuzz mutation references unknown action '{0}'")]
    UnknownFuzzAction(String),
    #[error("fuzz mutation action '{0}' must be an RPC action")]
    FuzzActionIsNotRpc(String),
    #[error("fuzz mutation for action '{action}' has invalid path '{path}': {reason}")]
    InvalidFuzzPath {
        action: String,
        path: String,
        reason: String,
    },
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

    #[test]
    fn fuzz_cases_are_deterministic() {
        let scenario = Scenario::from_yaml(
            r#"
name: fuzzed-call
actions:
  - kind: rpc
    id: call
    method: eth_call
    params: [{"data": "0x00"}, "latest"]
fuzz:
  cases: 2
  seed: 7
  mutations:
    - action: call
      path: /0/data
      values: ["0x01", "0x02"]
"#,
        )
        .expect("valid scenario");

        let first = scenario.fuzz_cases(2, 7).expect("valid fuzz cases");
        let second = scenario.fuzz_cases(2, 7).expect("valid fuzz cases");
        assert_eq!(first[0].mutations[0].value, second[0].mutations[0].value);
    }
}
