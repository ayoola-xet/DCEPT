use crate::{Scenario, ScenarioError};

/// A built-in, versioned protocol probe. The scenario is embedded in the CLI so
/// a user does not need a separate checkout to discover or run it.
#[derive(Debug, Clone, Copy)]
pub struct BuiltInProbe {
    pub id: &'static str,
    pub title: &'static str,
    pub scenario: &'static str,
}

const GLAMSTERDAM_PROBES: &[BuiltInProbe] = &[
    BuiltInProbe {
        id: "glamsterdam/engine-api-surface",
        title: "Amsterdam Engine API surface",
        scenario: include_str!("../probes/glamsterdam/engine-api-surface.yaml"),
    },
    BuiltInProbe {
        id: "glamsterdam/block-access-list-retrieval",
        title: "Block access list retrieval",
        scenario: include_str!("../probes/glamsterdam/block-access-list-retrieval.yaml"),
    },
    BuiltInProbe {
        id: "glamsterdam/gas-repricing-estimate",
        title: "Gas repricing estimates",
        scenario: include_str!("../probes/glamsterdam/gas-repricing-estimate.yaml"),
    },
    BuiltInProbe {
        id: "glamsterdam/malformed-block-access-list",
        title: "Malformed block access list rejection",
        scenario: include_str!("../probes/glamsterdam/malformed-block-access-list.yaml"),
    },
    BuiltInProbe {
        id: "glamsterdam/gloas-builder-status",
        title: "Gloas Builder API status",
        scenario: include_str!("../probes/glamsterdam/gloas-builder-status.yaml"),
    },
    BuiltInProbe {
        id: "glamsterdam/gloas-execution-payload-bid",
        title: "Gloas execution payload bid",
        scenario: include_str!("../probes/glamsterdam/gloas-execution-payload-bid.yaml"),
    },
];

pub fn built_in_probes() -> &'static [BuiltInProbe] {
    GLAMSTERDAM_PROBES
}

pub fn load_built_in_probe(id: &str) -> Result<Scenario, ScenarioError> {
    let probe = GLAMSTERDAM_PROBES
        .iter()
        .find(|probe| probe.id == id)
        .ok_or_else(|| ScenarioError::UnknownBuiltInProbe(id.to_owned()))?;
    Scenario::from_yaml(probe.scenario)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_built_in_probe_parses_with_protocol_metadata() {
        for probe in built_in_probes() {
            let scenario = load_built_in_probe(probe.id).expect("built-in probe must parse");
            assert_eq!(
                scenario
                    .probe
                    .as_ref()
                    .map(|metadata| metadata.upgrade.as_str()),
                Some("glamsterdam")
            );
        }
    }
}
