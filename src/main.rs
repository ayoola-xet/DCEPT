use std::{collections::BTreeMap, fs, path::PathBuf, process, time::Duration};

use anyhow::{Context, Result};
use clap::{Parser, Subcommand, ValueEnum};
use dcept::{
    ComparisonMode, RunConfiguration, RunOptions, Scenario, Target, TargetPair, execute_fuzz,
    execute_scenario,
    executor::headers_from_pairs,
    fixtures::{engine_fixture_scenario, inspect_engine_fixture, new_payload_v5_params},
    minimize_actions,
    probes::{built_in_probes, load_built_in_probe},
    scenario::{InputKind, ScenarioInput},
};
use reqwest::Url;

#[derive(Debug, Parser)]
#[command(
    name = "dcept",
    version,
    about = "Differential Compatibility for Ethereum Protocol Transitions"
)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// Validate a YAML scenario without contacting a target.
    Validate {
        scenario: PathBuf,
        #[command(flatten)]
        inputs: InputArguments,
    },
    /// Run a YAML scenario against baseline and candidate targets.
    Run {
        scenario: PathBuf,
        #[command(flatten)]
        targets: TargetArguments,
        #[arg(long)]
        output: Option<PathBuf>,
    },
    /// Generate and run deterministic input variants from a scenario fuzz block.
    Fuzz {
        scenario: PathBuf,
        #[command(flatten)]
        targets: TargetArguments,
        /// Override the configured case count. Use 0 to use the YAML value.
        #[arg(long, default_value_t = 0)]
        cases: u32,
        /// Override the configured deterministic seed.
        #[arg(long)]
        seed: Option<u64>,
        #[arg(long)]
        output: Option<PathBuf>,
    },
    /// Remove actions that do not reproduce an existing finding.
    Minimize {
        scenario: PathBuf,
        #[command(flatten)]
        targets: TargetArguments,
        #[arg(long)]
        output: PathBuf,
    },
    /// Discover and run built-in protocol upgrade probes.
    Probe {
        #[command(subcommand)]
        command: ProbeCommand,
    },
    /// Inspect and export official execution-spec Engine API fixture data.
    Fixture {
        #[command(subcommand)]
        command: FixtureCommand,
    },
}

#[derive(Debug, Subcommand)]
enum ProbeCommand {
    /// List built-in protocol probes.
    List,
    /// Print a built-in probe scenario as YAML.
    Show { id: String },
    /// Run a built-in protocol probe.
    Run {
        id: String,
        #[command(flatten)]
        targets: TargetArguments,
        #[arg(long)]
        output: Option<PathBuf>,
    },
}

#[derive(Debug, Subcommand)]
enum FixtureCommand {
    /// List fixture cases, payload counts, and Engine API versions.
    Inspect { fixture: PathBuf },
    /// Export one engine_newPayloadV5 directive as a JSON-RPC params array.
    NewPayloadV5Params {
        fixture: PathBuf,
        #[arg(long = "case")]
        fixture_case: String,
        #[arg(long, default_value_t = 0)]
        index: usize,
        #[arg(long)]
        output: Option<PathBuf>,
    },
    /// Replay one fixture case against two nodes prepared with that fixture state.
    Run {
        fixture: PathBuf,
        #[arg(long = "case")]
        fixture_case: String,
        #[command(flatten)]
        targets: FixtureTargetArguments,
        #[arg(long)]
        output: Option<PathBuf>,
    },
}

#[derive(Debug, clap::Args, Default)]
struct InputArguments {
    /// Set a named scenario input. VALUE can be a JSON value or a plain string.
    #[arg(long = "var", value_name = "NAME=VALUE")]
    variables: Vec<String>,
    /// Load a named input from a JSON file. Use NAME=PATH.
    #[arg(long = "var-file", value_name = "NAME=PATH")]
    variable_files: Vec<String>,
}

#[derive(Debug, clap::Args)]
struct TargetArguments {
    #[arg(long = "baseline", visible_alias = "baseline-url")]
    baseline_url: Url,
    #[arg(long = "candidate", visible_alias = "candidate-url")]
    candidate_url: Url,
    #[arg(long, default_value = "baseline")]
    baseline_name: String,
    #[arg(long, default_value = "candidate")]
    candidate_name: String,
    #[arg(long = "baseline-header", value_name = "NAME:VALUE")]
    baseline_headers: Vec<String>,
    #[arg(long = "candidate-header", value_name = "NAME:VALUE")]
    candidate_headers: Vec<String>,
    #[arg(long, default_value_t = 30)]
    timeout_secs: u64,
    /// Select the product purpose for this comparison.
    #[arg(long, value_enum)]
    mode: Option<ComparisonModeArgument>,
    /// Identify the protocol rules used by the baseline target.
    #[arg(long)]
    baseline_protocol: Option<String>,
    /// Identify the protocol rules used by the candidate target.
    #[arg(long)]
    candidate_protocol: Option<String>,
    /// Identify the baseline client implementation.
    #[arg(long)]
    baseline_client: Option<String>,
    /// Identify the candidate client implementation.
    #[arg(long)]
    candidate_client: Option<String>,
    /// Record a deterministic fingerprint for the baseline starting state.
    #[arg(long)]
    baseline_state_fingerprint: Option<String>,
    /// Record a deterministic fingerprint for the candidate starting state.
    #[arg(long)]
    candidate_state_fingerprint: Option<String>,
    /// Explain why this run is a product control.
    #[arg(long)]
    control_reason: Option<String>,
    /// Mark an upgrade probe as an explicit historical fork-boundary probe.
    #[arg(long)]
    historical_fork_boundary: bool,
    /// Override mode identity protection.
    #[arg(long)]
    allow_mode_override: bool,
    /// Record why mode identity protection was overridden.
    #[arg(long)]
    mode_override_reason: Option<String>,
    #[command(flatten)]
    inputs: InputArguments,
}

#[derive(Debug, Clone, Copy, ValueEnum)]
enum ComparisonModeArgument {
    UpgradeDifferential,
    ClientDifferential,
    Control,
}

impl From<ComparisonModeArgument> for ComparisonMode {
    fn from(value: ComparisonModeArgument) -> Self {
        match value {
            ComparisonModeArgument::UpgradeDifferential => Self::UpgradeDifferential,
            ComparisonModeArgument::ClientDifferential => Self::ClientDifferential,
            ComparisonModeArgument::Control => Self::Control,
        }
    }
}

#[derive(Debug, clap::Args)]
struct FixtureTargetArguments {
    #[arg(long = "baseline", visible_alias = "baseline-url")]
    baseline_url: Url,
    #[arg(long = "candidate", visible_alias = "candidate-url")]
    candidate_url: Url,
    #[arg(long, default_value = "baseline")]
    baseline_name: String,
    #[arg(long, default_value = "candidate")]
    candidate_name: String,
    #[arg(long = "baseline-header", value_name = "NAME:VALUE")]
    baseline_headers: Vec<String>,
    #[arg(long = "candidate-header", value_name = "NAME:VALUE")]
    candidate_headers: Vec<String>,
    #[arg(long, default_value_t = 30)]
    timeout_secs: u64,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Command::Validate { scenario, inputs } => {
            let scenario = read_scenario(&scenario, &inputs)?;
            println!("Scenario '{}' is valid.", scenario.name);
        }
        Command::Run {
            scenario,
            targets,
            output,
        } => {
            let scenario = read_scenario(&scenario, &targets.inputs)?;
            let options = run_options(&targets, ComparisonMode::UpgradeDifferential);
            let targets = target_pair(targets)?;
            let report = execute_scenario(&scenario, &targets, &options).await?;
            let rendered =
                serde_json::to_string_pretty(&report).context("could not encode run report")?;
            if let Some(output) = output {
                fs::write(&output, &rendered)
                    .with_context(|| format!("could not write {}", output.display()))?;
            }
            println!("{rendered}");
            if report.has_findings {
                process::exit(2);
            }
        }
        Command::Fuzz {
            scenario,
            targets,
            cases,
            seed,
            output,
        } => {
            let scenario = read_scenario(&scenario, &targets.inputs)?;
            let options = run_options(&targets, ComparisonMode::UpgradeDifferential);
            let report =
                execute_fuzz(&scenario, &target_pair(targets)?, &options, cases, seed).await?;
            let rendered =
                serde_json::to_string_pretty(&report).context("could not encode fuzz report")?;
            if let Some(output) = output {
                fs::write(&output, &rendered)
                    .with_context(|| format!("could not write {}", output.display()))?;
            }
            println!("{rendered}");
            if report.finding_count > 0 {
                process::exit(2);
            }
        }
        Command::Minimize {
            scenario,
            targets,
            output,
        } => {
            let scenario = read_scenario(&scenario, &targets.inputs)?;
            let options = run_options(&targets, ComparisonMode::UpgradeDifferential);
            let minimized = minimize_actions(&scenario, &target_pair(targets)?, &options).await?;
            let rendered =
                serde_yaml::to_string(&minimized).context("could not encode minimized scenario")?;
            fs::write(&output, rendered)
                .with_context(|| format!("could not write {}", output.display()))?;
            println!("Wrote minimized scenario to {}.", output.display());
        }
        Command::Probe { command } => match command {
            ProbeCommand::List => {
                for probe in built_in_probes() {
                    println!("{}\t{}\t{}", probe.id, probe.comparison_mode, probe.title);
                }
            }
            ProbeCommand::Show { id } => {
                let scenario = load_built_in_probe(&id)?;
                print!(
                    "{}",
                    serde_yaml::to_string(&scenario).context("could not encode built-in probe")?
                );
            }
            ProbeCommand::Run {
                id,
                targets,
                output,
            } => {
                let default_mode = built_in_probes()
                    .iter()
                    .find(|probe| probe.id == id)
                    .map(|probe| comparison_mode_from_name(probe.comparison_mode))
                    .transpose()?
                    .unwrap_or(ComparisonMode::UpgradeDifferential);
                let scenario = load_built_in_probe(&id)?;
                let supplied = parse_input_arguments(&targets.inputs, &scenario.inputs)?;
                let scenario = scenario.resolve_inputs(&supplied)?;
                let mut options = run_options(&targets, default_mode);
                if options.configuration.comparison_mode == ComparisonMode::Control
                    && options.configuration.control_reason.is_none()
                {
                    options.configuration.control_reason = scenario.description.clone();
                }
                let targets = target_pair(targets)?;
                let report = execute_scenario(&scenario, &targets, &options).await?;
                let rendered =
                    serde_json::to_string_pretty(&report).context("could not encode run report")?;
                if let Some(output) = output {
                    fs::write(&output, &rendered)
                        .with_context(|| format!("could not write {}", output.display()))?;
                }
                println!("{rendered}");
                if report.has_findings {
                    process::exit(2);
                }
            }
        },
        Command::Fixture { command } => match command {
            FixtureCommand::Inspect { fixture } => {
                let source = read_fixture(&fixture)?;
                println!(
                    "{}",
                    serde_json::to_string_pretty(&inspect_engine_fixture(&source)?)?
                );
            }
            FixtureCommand::NewPayloadV5Params {
                fixture,
                fixture_case,
                index,
                output,
            } => {
                let params = new_payload_v5_params(&read_fixture(&fixture)?, &fixture_case, index)?;
                let rendered = serde_json::to_string_pretty(&params)?;
                if let Some(output) = output {
                    fs::write(&output, &rendered)
                        .with_context(|| format!("could not write {}", output.display()))?;
                } else {
                    println!("{rendered}");
                }
            }
            FixtureCommand::Run {
                fixture,
                fixture_case,
                targets,
                output,
            } => {
                let scenario = engine_fixture_scenario(&read_fixture(&fixture)?, &fixture_case)?;
                let options = fixture_run_options(&targets, &fixture_case);
                let report =
                    execute_scenario(&scenario, &fixture_target_pair(targets)?, &options).await?;
                let rendered =
                    serde_json::to_string_pretty(&report).context("could not encode run report")?;
                if let Some(output) = output {
                    fs::write(&output, &rendered)
                        .with_context(|| format!("could not write {}", output.display()))?;
                }
                println!("{rendered}");
                if report.has_findings {
                    process::exit(2);
                }
            }
        },
    }
    Ok(())
}

fn read_scenario(path: &PathBuf, inputs: &InputArguments) -> Result<Scenario> {
    let source =
        fs::read_to_string(path).with_context(|| format!("could not read {}", path.display()))?;
    let scenario = Scenario::from_yaml(&source).map_err(anyhow::Error::new)?;
    scenario
        .resolve_inputs(&parse_input_arguments(inputs, &scenario.inputs)?)
        .map_err(anyhow::Error::new)
}

fn read_fixture(path: &PathBuf) -> Result<String> {
    fs::read_to_string(path).with_context(|| format!("could not read fixture {}", path.display()))
}

fn parse_input_arguments(
    inputs: &InputArguments,
    definitions: &BTreeMap<String, ScenarioInput>,
) -> Result<BTreeMap<String, serde_json::Value>> {
    let mut values = BTreeMap::new();
    for pair in &inputs.variables {
        let (name, value) = pair
            .split_once('=')
            .ok_or_else(|| anyhow::anyhow!("input '{pair}' must use NAME=VALUE"))?;
        if name.trim().is_empty() {
            anyhow::bail!("input name is required");
        }
        let value = match definitions.get(name).map(|input| input.kind) {
            Some(InputKind::Json) | Some(InputKind::Quantity) => serde_json::from_str(value)
                .unwrap_or_else(|_| serde_json::Value::String(value.to_owned())),
            _ => serde_json::Value::String(value.to_owned()),
        };
        if values.insert(name.to_owned(), value).is_some() {
            anyhow::bail!("input '{name}' was set more than once");
        }
    }
    for pair in &inputs.variable_files {
        let (name, path) = pair
            .split_once('=')
            .ok_or_else(|| anyhow::anyhow!("input file '{pair}' must use NAME=PATH"))?;
        if name.trim().is_empty() {
            anyhow::bail!("input name is required");
        }
        let source = fs::read_to_string(path)
            .with_context(|| format!("could not read input file {path}"))?;
        let value = serde_json::from_str(&source)
            .with_context(|| format!("input file {path} is not valid JSON"))?;
        if values.insert(name.to_owned(), value).is_some() {
            anyhow::bail!("input '{name}' was set more than once");
        }
    }
    Ok(values)
}

fn target_pair(arguments: TargetArguments) -> Result<TargetPair> {
    build_target_pair(
        arguments.baseline_url,
        arguments.candidate_url,
        arguments.baseline_name,
        arguments.candidate_name,
        arguments.baseline_headers,
        arguments.candidate_headers,
    )
}

fn run_options(arguments: &TargetArguments, default_mode: ComparisonMode) -> RunOptions {
    RunOptions {
        timeout: Duration::from_secs(arguments.timeout_secs),
        configuration: RunConfiguration {
            comparison_mode: arguments
                .mode
                .map(ComparisonMode::from)
                .unwrap_or(default_mode),
            baseline_protocol: arguments.baseline_protocol.clone(),
            candidate_protocol: arguments.candidate_protocol.clone(),
            baseline_client: arguments.baseline_client.clone(),
            candidate_client: arguments.candidate_client.clone(),
            baseline_state_fingerprint: arguments.baseline_state_fingerprint.clone(),
            candidate_state_fingerprint: arguments.candidate_state_fingerprint.clone(),
            control_reason: arguments.control_reason.clone(),
            same_target: arguments.baseline_url == arguments.candidate_url,
            allow_mode_override: arguments.allow_mode_override,
            mode_override_reason: arguments.mode_override_reason.clone(),
            historical_fork_boundary: arguments.historical_fork_boundary,
        },
    }
}

fn comparison_mode_from_name(value: &str) -> Result<ComparisonMode> {
    match value {
        "upgrade_differential" => Ok(ComparisonMode::UpgradeDifferential),
        "client_differential" => Ok(ComparisonMode::ClientDifferential),
        "control" => Ok(ComparisonMode::Control),
        _ => anyhow::bail!("built-in probe has invalid comparison mode '{value}'"),
    }
}

fn fixture_run_options(arguments: &FixtureTargetArguments, fixture_case: &str) -> RunOptions {
    RunOptions {
        timeout: Duration::from_secs(arguments.timeout_secs),
        configuration: RunConfiguration {
            comparison_mode: ComparisonMode::ClientDifferential,
            baseline_protocol: Some("glamsterdam".to_owned()),
            candidate_protocol: Some("glamsterdam".to_owned()),
            baseline_client: Some(arguments.baseline_name.clone()),
            candidate_client: Some(arguments.candidate_name.clone()),
            baseline_state_fingerprint: Some(format!("fixture:{fixture_case}")),
            candidate_state_fingerprint: Some(format!("fixture:{fixture_case}")),
            same_target: arguments.baseline_url == arguments.candidate_url,
            ..RunConfiguration::default()
        },
    }
}

fn fixture_target_pair(arguments: FixtureTargetArguments) -> Result<TargetPair> {
    build_target_pair(
        arguments.baseline_url,
        arguments.candidate_url,
        arguments.baseline_name,
        arguments.candidate_name,
        arguments.baseline_headers,
        arguments.candidate_headers,
    )
}

fn build_target_pair(
    baseline_url: Url,
    candidate_url: Url,
    baseline_name: String,
    candidate_name: String,
    baseline_headers: Vec<String>,
    candidate_headers: Vec<String>,
) -> Result<TargetPair> {
    Ok(TargetPair {
        baseline: Target {
            name: baseline_name,
            url: baseline_url,
            headers: headers_from_pairs(&baseline_headers).map_err(anyhow::Error::msg)?,
        },
        candidate: Target {
            name: candidate_name,
            url: candidate_url,
            headers: headers_from_pairs(&candidate_headers).map_err(anyhow::Error::msg)?,
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(kind: InputKind) -> ScenarioInput {
        ScenarioInput {
            description: "test input".to_owned(),
            kind,
            required: true,
            default: None,
        }
    }

    #[test]
    fn keeps_plain_string_inputs_as_strings() {
        let definitions = BTreeMap::from([("slot".to_owned(), input(InputKind::String))]);
        let arguments = InputArguments {
            variables: vec!["slot=123".to_owned()],
            variable_files: Vec::new(),
        };
        let values = parse_input_arguments(&arguments, &definitions).expect("input parses");
        assert_eq!(
            values.get("slot"),
            Some(&serde_json::Value::String("123".to_owned()))
        );
    }

    #[test]
    fn parses_quantity_inputs_as_json_when_possible() {
        let definitions = BTreeMap::from([("count".to_owned(), input(InputKind::Quantity))]);
        let arguments = InputArguments {
            variables: vec!["count=1".to_owned()],
            variable_files: Vec::new(),
        };
        let values = parse_input_arguments(&arguments, &definitions).expect("input parses");
        assert_eq!(values.get("count"), Some(&serde_json::json!(1)));
    }
}
