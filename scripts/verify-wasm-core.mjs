import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const wasm = require("../apps/web/lib/wasm/glamprobe.js");

const scenario = `version: 1
name: wasm-core-invariant
inputs:
  block:
    description: A shared post-fork block.
    kind: quantity
    required: true
actions:
  - kind: rpc
    id: block
    method: eth_getBlockByNumber
    params: ["{{block}}", false]
`;

const parsed = wasm.parse_scenario(scenario);
if (parsed.actions[0]?.params[0] !== "{{block}}") throw new Error("The WASM scenario core did not preserve a declared input.");

const resolved = wasm.resolve_scenario(scenario, { block: "0x1234" });
if (Object.keys(resolved.inputs).length !== 0) throw new Error("The resolved WASM scenario still contains input definitions.");
if (resolved.actions[0]?.params[0] !== "0x1234") throw new Error("The WASM scenario core did not resolve the input value.");

let rejectedMissingInput = false;
try {
  wasm.resolve_scenario(scenario, {});
} catch {
  rejectedMissingInput = true;
}
if (!rejectedMissingInput) throw new Error("The WASM scenario core accepted a missing required input.");

const differences = wasm.compare_json({ result: "0x1" }, { result: "0x2" }, { ignore_paths: [], numeric_tolerances: [] });
if (differences.length !== 1 || differences[0].path !== "/result") throw new Error("The WASM comparison core did not report the expected difference.");

console.log("WASM scenario and comparison invariant passed.");
