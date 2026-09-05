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

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly build_run_report: (a: any, b: any, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly compare_json: (a: any, b: any, c: any) => [number, number, number];
    readonly evaluate_action: (a: any, b: any) => [number, number, number];
    readonly evaluate_fuzz: (a: any, b: any, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly evaluate_run: (a: any, b: any, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly parse_scenario: (a: number, b: number) => [number, number, number];
    readonly plan_configured_fuzz: (a: number, b: number, c: any, d: any, e: any) => [number, number, number];
    readonly plan_configured_scenario: (a: number, b: number, c: any, d: any) => [number, number, number];
    readonly plan_fuzz: (a: number, b: number, c: any, d: any) => [number, number, number];
    readonly plan_scenario: (a: number, b: number, c: any) => [number, number, number];
    readonly resolve_scenario: (a: number, b: number, c: any) => [number, number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
