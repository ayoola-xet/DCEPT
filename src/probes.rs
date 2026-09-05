use crate::{Scenario, ScenarioError};

/// A built-in, versioned protocol probe. The scenario is embedded in the CLI so
/// a user does not need a separate checkout to discover or run it.
#[derive(Debug, Clone, Copy)]
pub struct BuiltInProbe {
    pub id: &'static str,
    pub title: &'static str,
    pub comparison_mode: &'static str,
    pub scenario: &'static str,
}

const GLAMSTERDAM_PROBES: &[BuiltInProbe] =
    include!(concat!(env!("OUT_DIR"), "/probe_registry.rs"));

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
            assert!(matches!(
                probe.comparison_mode,
                "upgrade_differential" | "client_differential" | "control"
            ));
            let scenario = load_built_in_probe(probe.id).expect("built-in probe must parse");
            assert_eq!(
                scenario
                    .probe
                    .as_ref()
                    .map(|metadata| metadata.upgrade.as_str()),
                Some("glamsterdam")
            );
        }
        assert!(built_in_probes().iter().any(|probe| {
            probe.id == "glamsterdam/gas-repricing-estimate"
                && probe.comparison_mode == "upgrade_differential"
        }));
        assert!(built_in_probes().iter().any(|probe| {
            probe.id == "glamsterdam/fork-boundary-control" && probe.comparison_mode == "control"
        }));
    }
}
