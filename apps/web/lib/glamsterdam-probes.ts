import generatedPack from "./generated/glamsterdam-probes.json";
import type { ComparisonMode } from "./core-types";

export type GlamsterdamProbe = {
  id: string;
  title: string;
  comparisonMode: ComparisonMode;
  detail: string;
  yaml: string;
};

export const glamsterdamProbes: GlamsterdamProbe[] = generatedPack.probes.map((probe) => ({
  ...probe,
  comparisonMode: comparisonMode(probe.comparisonMode),
}));

const defaultProbe = glamsterdamProbes.find((probe) => probe.id === generatedPack.defaultProbeId);
if (!defaultProbe) throw new Error(`The default probe '${generatedPack.defaultProbeId}' does not exist.`);

export const defaultGlamsterdamProbe = defaultProbe;

function comparisonMode(value: string): ComparisonMode {
  if (value === "upgrade_differential" || value === "client_differential" || value === "control") return value;
  throw new Error(`The generated probe comparison mode '${value}' is invalid.`);
}
