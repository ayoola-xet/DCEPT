import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(repositoryRoot, "apps/web/package.json"));
const YAML = require("yaml");
const packRoot = resolve(repositoryRoot, "probes/glamsterdam");
const outputPath = resolve(repositoryRoot, "apps/web/lib/generated/glamsterdam-probes.json");
const manifest = YAML.parse(await readFile(resolve(packRoot, "manifest.yaml"), "utf8"));
const probes = await Promise.all(manifest.probes.map(async (entry) => {
  const yaml = await readFile(resolve(packRoot, entry.scenario), "utf8");
  const scenario = YAML.parse(yaml);
  return {
    id: entry.id,
    title: entry.title,
    comparisonMode: entry.comparison_mode,
    detail: scenario.description,
    yaml,
  };
}));
const output = `${JSON.stringify({ defaultProbeId: manifest.default_probe, probes }, null, 2)}\n`;

if (process.argv.includes("--check")) {
  const current = await readFile(outputPath, "utf8").catch(() => "");
  if (current !== output) throw new Error("The generated web probe pack is stale. Run npm run generate:probes.");
  console.log(`Verified ${probes.length} generated Glamsterdam web probes.`);
} else {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, output);
  console.log(`Generated ${probes.length} Glamsterdam web probes.`);
}
