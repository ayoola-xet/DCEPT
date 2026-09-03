/* tslint:disable */
/* eslint-disable */

/**
 * Compare two parsed JSON values in a JavaScript workflow step.
 */
export function compare_json(baseline: any, candidate: any, comparison: any): any;

/**
 * Parse and validate a YAML scenario without resolving its declared inputs.
 */
export function parse_scenario(source: string): any;

/**
 * Parse and resolve a YAML scenario with the same core that powers the CLI.
 */
export function resolve_scenario(source: string, inputs: any): any;
