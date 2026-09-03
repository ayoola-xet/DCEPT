import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import YAML from "yaml";

const appRoot = process.cwd();
const repositoryRoot = resolve(appRoot, "../..");
const packRoot = resolve(repositoryRoot, "probes/glamsterdam");
const templateSource = await readFile(resolve(appRoot, "lib/glamsterdam-probes.ts"), "utf8");
const manifest = YAML.parse(await readFile(resolve(packRoot, "manifest.yaml"), "utf8"));

const templates = new Map(
  [...templateSource.matchAll(/id: "([^"]+)",[\s\S]*?yaml: `([\s\S]*?)`,/g)].map((match) => [match[1], YAML.parse(match[2])]),
);

const expectedIds = manifest.probes.map((probe) => probe.id);
if (templates.size !== expectedIds.length) {
  throw new Error(`The web pack has ${templates.size} templates. The CLI manifest has ${expectedIds.length} probes.`);
}

for (const entry of manifest.probes) {
  const expected = YAML.parse(await readFile(resolve(packRoot, entry.scenario), "utf8"));
  const actual = templates.get(entry.id);
  if (!actual) throw new Error(`The web pack does not include '${entry.id}'.`);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`The web template for '${entry.id}' differs from ${entry.scenario}.`);
  }
}

console.log(`Verified ${expectedIds.length} Glamsterdam web probe templates.`);
