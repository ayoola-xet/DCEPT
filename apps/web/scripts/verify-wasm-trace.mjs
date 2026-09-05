import { readFile } from "node:fs/promises";

const routes = [
  ".next/server/app/api/public/run/route.js.nft.json",
  ".next/server/app/api/v1/runs/route.js.nft.json",
  ".next/server/app/api/v1/scenarios/route.js.nft.json",
];

for (const route of routes) {
  const trace = await readFile(route, "utf8");
  if (!trace.includes("node_modules/dcept/dcept_bg.wasm")) {
    throw new Error(`${route} does not include the Rust WebAssembly binary.`);
  }
}

console.log("Verified Rust WebAssembly tracing for server routes.");
