//! DCEPT compares pre-upgrade and post-upgrade Ethereum behavior.

pub mod compare;
pub mod engine;
#[cfg(not(target_arch = "wasm32"))]
pub mod executor;
pub mod fixtures;
pub mod probes;
pub mod scenario;

#[cfg(feature = "wasm")]
mod wasm;

pub use compare::{Diff, DiffKind, compare_values};
pub use engine::{
    ActionExecution, ActionPlan, ActionReport, AssertionFailure, ComparisonMode, EngineError,
    FuzzCaseExecution, FuzzPlan, FuzzReport, OperationResult, ReportStatus, RequestPlan,
    RunConfiguration, RunPlan, RunReport, StateEquivalenceStatus, evaluate_action, evaluate_fuzz,
    evaluate_run, plan_fuzz, plan_scenario,
};
#[cfg(not(target_arch = "wasm32"))]
pub use executor::{
    MinimizationError, RunOptions, Target, TargetPair, execute_fuzz, execute_scenario,
    minimize_actions,
};
pub use scenario::{Action, Comparison, FuzzCase, FuzzConfig, Scenario, ScenarioError};
