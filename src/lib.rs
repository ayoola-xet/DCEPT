//! GlamProbe compares Ethereum-compatible environments through declared scenarios.

pub mod compare;
pub mod executor;
pub mod scenario;

pub use compare::{Diff, DiffKind, compare_values};
pub use executor::{
    FuzzReport, MinimizationError, RunOptions, RunReport, Target, TargetPair, execute_fuzz,
    execute_scenario, minimize_actions,
};
pub use scenario::{Action, Comparison, FuzzCase, FuzzConfig, Scenario, ScenarioError};
