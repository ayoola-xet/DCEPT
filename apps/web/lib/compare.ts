type Comparison = { ignore_paths: string[]; numeric_tolerances: { path: string; absolute: number }[] };
type Difference = { path: string; kind: "value_mismatch" | "missing_baseline" | "missing_candidate" | "type_mismatch"; baseline: unknown; candidate: unknown };

/** JavaScript host for the same JSON pointer comparison contract as the Rust core. */
export function compareJson(baseline: unknown, candidate: unknown, comparison: Comparison): Difference[] {
  const diffs: Difference[] = [];
  compareAt("", baseline, candidate, comparison, diffs);
  return diffs;
}

function compareAt(path: string, baseline: unknown, candidate: unknown, rules: Comparison, diffs: Difference[]) {
  if (rules.ignore_paths.includes(path) || withinTolerance(path, baseline, candidate, rules)) return;
  if (isRecord(baseline) && isRecord(candidate)) {
    for (const key of new Set([...Object.keys(baseline), ...Object.keys(candidate)])) {
      const childPath = `${path}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`;
      if (key in baseline && key in candidate) compareAt(childPath, baseline[key], candidate[key], rules, diffs);
      else diffs.push({ path: childPath, kind: key in baseline ? "missing_candidate" : "missing_baseline", baseline: baseline[key] ?? null, candidate: candidate[key] ?? null });
    }
    return;
  }
  if (Array.isArray(baseline) && Array.isArray(candidate)) {
    for (let index = 0; index < Math.max(baseline.length, candidate.length); index += 1) {
      const pathAtIndex = `${path}/${index}`;
      if (index in baseline && index in candidate) compareAt(pathAtIndex, baseline[index], candidate[index], rules, diffs);
      else diffs.push({ path: pathAtIndex, kind: index in baseline ? "missing_candidate" : "missing_baseline", baseline: baseline[index] ?? null, candidate: candidate[index] ?? null });
    }
    return;
  }
  if (JSON.stringify(baseline) !== JSON.stringify(candidate)) {
    diffs.push({ path, kind: typeof baseline === typeof candidate ? "value_mismatch" : "type_mismatch", baseline, candidate });
  }
}

function withinTolerance(path: string, baseline: unknown, candidate: unknown, rules: Comparison) {
  const tolerance = rules.numeric_tolerances.find((rule) => rule.path === path);
  if (!tolerance) return false;
  const left = numberValue(baseline); const right = numberValue(candidate);
  return left !== null && right !== null && Math.abs(left - right) <= tolerance.absolute;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string") return value.startsWith("0x") ? Number.parseInt(value, 16) : Number(value);
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
