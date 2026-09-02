//! GlamProbe compares Ethereum-compatible environments through declared scenarios.

pub mod compare;
pub mod executor;
pub mod scenario;

pub use compare::{Diff, DiffKind, compare_values};
pub use executor::{RunOptions, RunReport, Target, TargetPair, execute_scenario};
pub use scenario::{Action, Comparison, Scenario, ScenarioError};
