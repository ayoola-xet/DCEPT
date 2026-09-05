/* tslint:disable */
/* eslint-disable */

/**
 * Build one report from Rust-evaluated action reports.
 */
export function build_run_report(plan: any, actions: any, baseline_target: string, candidate_target: string): any;

/**
 * Compare two parsed JSON values in a JavaScript workflow step.
 */
export function compare_json(baseline: any, candidate: any, comparison: any): any;

/**
 * Evaluate one host execution with Rust comparison and assertion logic.
 */
export function evaluate_action(plan: any, execution: any): any;

/**
 * Evaluate complete deterministic fuzz executions and produce the report.
 */
export function evaluate_fuzz(plan: any, executions: any, baseline_target: string, candidate_target: string): any;

/**
 * Evaluate a complete host run and produce the authoritative report.
 */
export function evaluate_run(plan: any, executions: any, baseline_target: string, candidate_target: string): any;

/**
 * Parse and validate a YAML scenario without resolving its declared inputs.
 */
export function parse_scenario(source: string): any;

/**
 * Resolve a fuzz scenario and apply explicit comparison-mode metadata.
 */
export function plan_configured_fuzz(source: string, inputs: any, overrides: any, configuration: any): any;

/**
 * Resolve a scenario and apply explicit comparison-mode metadata.
 */
export function plan_configured_scenario(source: string, inputs: any, configuration: any): any;

/**
 * Resolve a scenario and produce deterministic fuzz request plans.
 */
export function plan_fuzz(source: string, inputs: any, overrides: any): any;

/**
 * Resolve a scenario and produce the authoritative request plan for a host.
 */
export function plan_scenario(source: string, inputs: any): any;

/**
 * Parse and resolve a YAML scenario with the same core that powers the CLI.
 */
export function resolve_scenario(source: string, inputs: any): any;
