use std::{collections::BTreeMap, fs, path::PathBuf, process, time::Duration};

use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use glamprobe::{
    RunOptions, Scenario, Target, TargetPair, execute_fuzz, execute_scenario,
    executor::headers_from_pairs,
    minimize_actions,
    probes::{built_in_probes, load_built_in_probe},
};
use reqwest::Url;

#[derive(Debug, Parser)]
#[command(
    name = "glamprobe",
    version,
    about = "Differential compatibility testing for Ethereum protocol changes"
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

#[derive(Debug, clap::Args, Default)]
struct InputArguments {
    /// Set a named scenario input. VALUE can be a JSON value or a plain string.
    #[arg(long = "var", value_name = "NAME=VALUE")]
    variables: Vec<String>,
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
    #[command(flatten)]
    inputs: InputArguments,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Command::Validate { scenario, inputs } => {
            let scenario = read_scenario(&scenario, &inputs.variables)?;
            println!("Scenario '{}' is valid.", scenario.name);
        }
        Command::Run {
            scenario,
            targets,
            output,
        } => {
            let scenario = read_scenario(&scenario, &targets.inputs.variables)?;
            let timeout = targets.timeout_secs;
            let targets = target_pair(targets)?;
            let report = execute_scenario(
                &scenario,
                &targets,
                &RunOptions {
                    timeout: Duration::from_secs(timeout),
                },
            )
            .await;
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
            let scenario = read_scenario(&scenario, &targets.inputs.variables)?;
            let options = RunOptions {
                timeout: Duration::from_secs(targets.timeout_secs),
            };
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
            let scenario = read_scenario(&scenario, &targets.inputs.variables)?;
            let options = RunOptions {
                timeout: Duration::from_secs(targets.timeout_secs),
            };
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
                    println!("{}\t{}", probe.id, probe.title);
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
                let supplied = parse_input_pairs(&targets.inputs.variables)?;
                let scenario = load_built_in_probe(&id)?.resolve_inputs(&supplied)?;
                let timeout = targets.timeout_secs;
                let targets = target_pair(targets)?;
                let report = execute_scenario(
                    &scenario,
                    &targets,
                    &RunOptions {
                        timeout: Duration::from_secs(timeout),
                    },
                )
                .await;
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

fn read_scenario(path: &PathBuf, pairs: &[String]) -> Result<Scenario> {
    let source =
        fs::read_to_string(path).with_context(|| format!("could not read {}", path.display()))?;
    let scenario = Scenario::from_yaml(&source).map_err(anyhow::Error::new)?;
    scenario
        .resolve_inputs(&parse_input_pairs(pairs)?)
        .map_err(anyhow::Error::new)
}

fn parse_input_pairs(pairs: &[String]) -> Result<BTreeMap<String, serde_json::Value>> {
    let mut values = BTreeMap::new();
    for pair in pairs {
        let (name, value) = pair
            .split_once('=')
            .ok_or_else(|| anyhow::anyhow!("input '{pair}' must use NAME=VALUE"))?;
        if name.trim().is_empty() {
            anyhow::bail!("input name is required");
        }
        let value = serde_json::from_str(value)
            .unwrap_or_else(|_| serde_json::Value::String(value.to_owned()));
        if values.insert(name.to_owned(), value).is_some() {
            anyhow::bail!("input '{name}' was set more than once");
        }
    }
    Ok(values)
}

fn target_pair(arguments: TargetArguments) -> Result<TargetPair> {
    Ok(TargetPair {
        baseline: Target {
            name: arguments.baseline_name,
            url: arguments.baseline_url,
            headers: headers_from_pairs(&arguments.baseline_headers).map_err(anyhow::Error::msg)?,
        },
        candidate: Target {
            name: arguments.candidate_name,
            url: arguments.candidate_url,
            headers: headers_from_pairs(&arguments.candidate_headers)
                .map_err(anyhow::Error::msg)?,
        },
    })
}
