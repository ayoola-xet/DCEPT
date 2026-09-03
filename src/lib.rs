//! GlamProbe compares Ethereum-compatible environments through declared scenarios.

pub mod compare;
#[cfg(not(target_arch = "wasm32"))]
pub mod executor;
pub mod fixtures;
pub mod probes;
pub mod scenario;

#[cfg(feature = "wasm")]
mod wasm;

pub use compare::{Diff, DiffKind, compare_values};
#[cfg(not(target_arch = "wasm32"))]
pub use executor::{
    FuzzReport, MinimizationError, RunOptions, RunReport, Target, TargetPair, execute_fuzz,
    execute_scenario, minimize_actions,
};
pub use scenario::{Action, Comparison, FuzzCase, FuzzConfig, Scenario, ScenarioError};
