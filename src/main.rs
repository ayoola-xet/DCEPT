use std::{fs, path::PathBuf, process, time::Duration};

use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use glamprobe::{
    RunOptions, Scenario, Target, TargetPair, execute_scenario, executor::headers_from_pairs,
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
    Validate { scenario: PathBuf },
    /// Run a YAML scenario against baseline and candidate targets.
    Run {
        scenario: PathBuf,
        #[arg(long)]
        baseline_url: Url,
        #[arg(long)]
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
        #[arg(long)]
        output: Option<PathBuf>,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Command::Validate { scenario } => {
            let scenario = read_scenario(&scenario)?;
            println!("Scenario '{}' is valid.", scenario.name);
        }
        Command::Run {
            scenario,
            baseline_url,
            candidate_url,
            baseline_name,
            candidate_name,
            baseline_headers,
            candidate_headers,
            timeout_secs,
            output,
        } => {
            let scenario = read_scenario(&scenario)?;
            let targets = TargetPair {
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
            };
            let report = execute_scenario(
                &scenario,
                &targets,
                &RunOptions {
                    timeout: Duration::from_secs(timeout_secs),
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
    }
    Ok(())
}

fn read_scenario(path: &PathBuf) -> Result<Scenario> {
    let source =
        fs::read_to_string(path).with_context(|| format!("could not read {}", path.display()))?;
    Scenario::from_yaml(&source).map_err(anyhow::Error::new)
}
