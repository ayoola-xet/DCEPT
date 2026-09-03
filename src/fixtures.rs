use serde::Serialize;
use serde_json::{Value, json};
use thiserror::Error;

use crate::scenario::{
    Action, Comparison, ResponseAssertion, RpcAction, Scenario, TargetExpectations,
};

/// Summary of an official execution-spec Engine API fixture case.
#[derive(Debug, Clone, Serialize)]
pub struct FixtureCaseSummary {
    pub name: String,
    pub payload_count: usize,
    pub engine_versions: Vec<u64>,
}

/// Read a `blockchain_test_engine` fixture file without starting a client.
pub fn inspect_engine_fixture(source: &str) -> Result<Vec<FixtureCaseSummary>, FixtureError> {
    let root: Value = serde_json::from_str(source)
        .map_err(|error| FixtureError::InvalidJson(error.to_string()))?;
    let cases = root.as_object().ok_or(FixtureError::InvalidRoot)?;
    let mut summaries = Vec::new();
    for (name, fixture) in cases {
        let payloads = engine_payloads(fixture)?;
        let mut engine_versions = Vec::with_capacity(payloads.len());
        for payload in payloads {
            engine_versions.push(engine_version(payload)?);
        }
        summaries.push(FixtureCaseSummary {
            name: name.clone(),
            payload_count: payloads.len(),
            engine_versions,
        });
    }
    Ok(summaries)
}

/// Convert one Engine API V5 directive into the exact JSON-RPC params array.
pub fn new_payload_v5_params(
    source: &str,
    fixture_case: &str,
    index: usize,
) -> Result<Value, FixtureError> {
    let root: Value = serde_json::from_str(source)
        .map_err(|error| FixtureError::InvalidJson(error.to_string()))?;
    let fixture = root
        .as_object()
        .ok_or(FixtureError::InvalidRoot)?
        .get(fixture_case)
        .ok_or_else(|| FixtureError::UnknownCase(fixture_case.to_owned()))?;
    let directive =
        engine_payloads(fixture)?
            .get(index)
            .ok_or_else(|| FixtureError::MissingPayload {
                fixture_case: fixture_case.to_owned(),
                index,
            })?;
    let version = engine_version(directive)?;
    if version != 5 {
        return Err(FixtureError::UnsupportedEngineVersion(version));
    }
    engine_new_payload_params(directive)
}

/// Build a scenario that replays each Engine API directive in one fixture case.
///
/// The targets must already run with the fixture network, genesis header, and
/// pre-state. GlamProbe does not create or configure nodes.
pub fn engine_fixture_scenario(source: &str, fixture_case: &str) -> Result<Scenario, FixtureError> {
    let root: Value = serde_json::from_str(source)
        .map_err(|error| FixtureError::InvalidJson(error.to_string()))?;
    let fixture = root
        .as_object()
        .ok_or(FixtureError::InvalidRoot)?
        .get(fixture_case)
        .ok_or_else(|| FixtureError::UnknownCase(fixture_case.to_owned()))?;
    let actions = engine_payloads(fixture)?
        .iter()
        .enumerate()
        .map(|(index, directive)| fixture_action(index, directive))
        .collect::<Result<Vec<_>, _>>()?;
    let scenario = Scenario {
        version: 1,
        name: format!("fixture-{fixture_case}"),
        description: Some(format!(
            "Replay Engine API directives from fixture case '{fixture_case}'."
        )),
        probe: None,
        inputs: Default::default(),
        actions,
        fuzz: None,
    };
    scenario
        .validate()
        .map_err(|error| FixtureError::Scenario(error.to_string()))?;
    Ok(scenario)
}

fn fixture_action(index: usize, directive: &Value) -> Result<Action, FixtureError> {
    let version = engine_version(directive)?;
    let expectations = fixture_expectations(directive);
    Ok(Action::Rpc(RpcAction {
        id: format!("new-payload-{index}-v{version}"),
        method: format!("engine_newPayloadV{version}"),
        params: engine_new_payload_params(directive)?,
        baseline_params: None,
        candidate_params: None,
        comparison: Comparison::default(),
        expect: expectations,
    }))
}

fn fixture_expectations(directive: &Value) -> TargetExpectations {
    let assertion = if let Some(error_code) = field(directive, &["errorCode", "error_code"]) {
        ResponseAssertion {
            path: "/error/code".to_owned(),
            equals: Some(error_code.clone()),
            contains_all: Vec::new(),
            has_keys: Vec::new(),
            is_hex_quantity: false,
        }
    } else {
        let status = if field(directive, &["validationError", "validation_error"]).is_some() {
            "INVALID"
        } else {
            "VALID"
        };
        ResponseAssertion {
            path: "/result/status".to_owned(),
            equals: Some(json!(status)),
            contains_all: Vec::new(),
            has_keys: Vec::new(),
            is_hex_quantity: false,
        }
    };
    TargetExpectations {
        baseline: vec![assertion.clone()],
        candidate: vec![assertion],
    }
}

fn engine_new_payload_params(directive: &Value) -> Result<Value, FixtureError> {
    let version = engine_version(directive)?;
    if !(1..=5).contains(&version) {
        return Err(FixtureError::UnsupportedEngineVersion(version));
    }
    let payload = field(directive, &["executionPayload", "execution_payload"])
        .ok_or_else(|| FixtureError::MissingField("executionPayload".to_owned()))?
        .clone();
    if version <= 2 {
        return Ok(Value::Array(vec![payload]));
    }
    let versioned_hashes = field(directive, &["blobVersionedHashes", "blob_versioned_hashes"])
        .cloned()
        .unwrap_or_else(|| Value::Array(Vec::new()));
    let parent_beacon_block_root = field(
        directive,
        &["parentBeaconBlockRoot", "parent_beacon_block_root"],
    )
    .cloned()
    .ok_or_else(|| FixtureError::MissingField("parentBeaconBlockRoot".to_owned()))?;
    if version == 3 {
        return Ok(Value::Array(vec![
            payload,
            versioned_hashes,
            parent_beacon_block_root,
        ]));
    }
    let execution_requests = field(directive, &["executionRequests", "execution_requests"])
        .cloned()
        .unwrap_or_else(|| Value::Array(Vec::new()));
    Ok(Value::Array(vec![
        payload,
        versioned_hashes,
        parent_beacon_block_root,
        execution_requests,
    ]))
}

fn engine_payloads(fixture: &Value) -> Result<&Vec<Value>, FixtureError> {
    field(fixture, &["engineNewPayloads", "engine_new_payloads"])
        .and_then(Value::as_array)
        .ok_or_else(|| FixtureError::MissingField("engineNewPayloads".to_owned()))
}

fn engine_version(directive: &Value) -> Result<u64, FixtureError> {
    let value = field(
        directive,
        &["version", "newPayloadVersion", "new_payload_version"],
    )
    .ok_or_else(|| FixtureError::MissingField("version".to_owned()))?;
    value
        .as_u64()
        .or_else(|| value.as_str().and_then(|value| value.parse().ok()))
        .ok_or_else(|| FixtureError::InvalidVersion(value.clone()))
}

fn field<'a>(value: &'a Value, names: &[&str]) -> Option<&'a Value> {
    let object = value.as_object()?;
    names.iter().find_map(|name| object.get(*name))
}

#[derive(Debug, Error)]
pub enum FixtureError {
    #[error("fixture JSON is invalid: {0}")]
    InvalidJson(String),
    #[error("fixture root must be an object of named test cases")]
    InvalidRoot,
    #[error("fixture case '{0}' does not exist")]
    UnknownCase(String),
    #[error("fixture field '{0}' is required")]
    MissingField(String),
    #[error("fixture Engine API version is invalid: {0}")]
    InvalidVersion(Value),
    #[error("fixture case '{fixture_case}' has no Engine API payload at index {index}")]
    MissingPayload { fixture_case: String, index: usize },
    #[error("this command needs an engine_newPayloadV5 directive, but the fixture uses V{0}")]
    UnsupportedEngineVersion(u64),
    #[error("the fixture cannot create a scenario: {0}")]
    Scenario(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = r#"{
      "mixed_results": {
        "engineNewPayloads": [{
          "version": 5,
          "executionPayload": {"blockAccessList": "0xc0"},
          "blobVersionedHashes": [],
          "parentBeaconBlockRoot": "0x01",
          "executionRequests": []
        }, {
          "version": 4,
          "executionPayload": {"blockAccessList": "0xc0"},
          "blobVersionedHashes": [],
          "parentBeaconBlockRoot": "0x01",
          "executionRequests": [],
          "validationError": "INVALID_BLOCK_HASH"
        }, {
          "version": 3,
          "executionPayload": {"blockAccessList": "0xc0"},
          "blobVersionedHashes": [],
          "parentBeaconBlockRoot": "0x01",
          "errorCode": -32602
        }]
      }
    }"#;

    #[test]
    fn inspects_and_converts_engine_v5_fixture_data() {
        let cases = inspect_engine_fixture(FIXTURE).expect("fixture is valid");
        assert_eq!(cases[0].name, "mixed_results");
        assert_eq!(cases[0].engine_versions, vec![5, 4, 3]);
        let params = new_payload_v5_params(FIXTURE, "mixed_results", 0).expect("params convert");
        assert_eq!(
            params.pointer("/0/blockAccessList"),
            Some(&Value::String("0xc0".to_owned()))
        );
        assert_eq!(
            params.pointer("/2"),
            Some(&Value::String("0x01".to_owned()))
        );
    }

    #[test]
    fn creates_ordered_fixture_replay_actions_with_expected_results() {
        let scenario = engine_fixture_scenario(FIXTURE, "mixed_results").expect("scenario builds");
        assert_eq!(scenario.actions.len(), 3);
        let Action::Rpc(first) = &scenario.actions[0] else {
            panic!("expected RPC action")
        };
        assert_eq!(first.method, "engine_newPayloadV5");
        assert_eq!(first.expect.baseline[0].path, "/result/status");
        assert_eq!(first.expect.baseline[0].equals, Some(json!("VALID")));
        let Action::Rpc(second) = &scenario.actions[1] else {
            panic!("expected RPC action")
        };
        assert_eq!(second.expect.baseline[0].equals, Some(json!("INVALID")));
        let Action::Rpc(third) = &scenario.actions[2] else {
            panic!("expected RPC action")
        };
        assert_eq!(third.expect.baseline[0].path, "/error/code");
        assert_eq!(third.expect.baseline[0].equals, Some(json!(-32602)));
    }
}
