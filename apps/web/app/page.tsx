"use client";

import { useState, type ChangeEvent } from "react";

import { parseHostedScenario, resolveHostedScenarioInputs } from "@/lib/hosted-scenario";
import { defaultGlamsterdamProbe, glamsterdamProbes } from "@/lib/glamsterdam-probes";
import { runPublicScenario, type Comparator, type PublicRunReport } from "@/lib/public-run";

type RunMode = "browser" | "vercel";
type RustWasm = { default: (input?: RequestInfo | URL | BufferSource | WebAssembly.Module) => Promise<unknown>; compare_json: Comparator };

export default function LocalRunPage() {
  const [scenarioYaml, setScenarioYaml] = useState<string>(defaultGlamsterdamProbe.yaml);
  const [selectedProbe, setSelectedProbe] = useState<string>(defaultGlamsterdamProbe.id);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [baseline, setBaseline] = useState("");
  const [candidate, setCandidate] = useState("");
  const [mode, setMode] = useState<RunMode>("browser");
  const [report, setReport] = useState<PublicRunReport | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inputScenario = tryParseScenario(scenarioYaml);

  async function loadScenario(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setScenarioYaml(await file.text());
    setSelectedProbe("custom");
    setInputValues({});
    setReport(null);
    setError("");
  }

  async function run() {
    setBusy(true);
    setError("");
    setReport(null);
    try {
      const inputs = inputValuesFor(inputScenario, inputValues);
      const scenario = resolveHostedScenarioInputs(parseHostedScenario(scenarioYaml), inputs);
      if (mode === "browser") {
        const comparator = await loadRustComparator();
        setReport(await runPublicScenario(scenario, { endpoint: baseline }, { endpoint: candidate }, comparator));
      } else {
        const response = await fetch("/api/public/run", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ scenarioYaml, baseline, candidate, inputs }),
        });
        const result = await response.json() as PublicRunReport | { error: string };
        if (!response.ok || "error" in result) throw new Error("error" in result ? result.error : "The no-login server runner failed.");
        setReport(result);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The run failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="content local-workspace">
      <div className="eyebrow">Glamsterdam differential probe</div>
      <div className="page-heading compact">
        <div>
          <h1>Find an upgrade regression before the fork.</h1>
          <p>Select a versioned Glamsterdam probe. Run it against state-aligned baseline and candidate targets. The browser loads the Rust comparison core as WebAssembly.</p>
        </div>
      </div>

      <div className="notice" role="note">
        <strong>Use test endpoints.</strong> Browser mode sends requests from this device. Server mode sends only read RPC requests through Vercel. Neither mode sends endpoint credentials.
      </div>

      <div className="workspace-grid">
        <section className="panel workspace-form" aria-label="Scenario and targets">
          <div className="panel-heading">
            <div><span className="eyebrow">Input</span><h2>Probe and targets</h2></div>
            <label className="file-load">Load YAML<input type="file" accept=".yaml,.yml,text/yaml" onChange={loadScenario} /></label>
          </div>

          <label className="field">
            <span>Glamsterdam probe</span>
            <select value={selectedProbe} onChange={(event) => {
              const probe = glamsterdamProbes.find((candidate) => candidate.id === event.target.value);
              setSelectedProbe(probe?.id ?? "custom");
              if (probe) setScenarioYaml(probe.yaml);
              setInputValues({});
              setReport(null);
              setError("");
            }}>
              {glamsterdamProbes.map((probe) => <option key={probe.id} value={probe.id}>{probe.title}</option>)}
              <option value="custom">Custom YAML scenario</option>
            </select>
          </label>
          {selectedProbe !== "custom" && <p className="probe-detail">{glamsterdamProbes.find((probe) => probe.id === selectedProbe)?.detail}</p>}
          <label className="field">
            <span>Baseline RPC endpoint</span>
            <input value={baseline} onChange={(event) => setBaseline(event.target.value)} placeholder="https://baseline.example/rpc" inputMode="url" />
          </label>
          <label className="field">
            <span>Candidate RPC endpoint</span>
            <input value={candidate} onChange={(event) => setCandidate(event.target.value)} placeholder="https://candidate.example/rpc" inputMode="url" />
          </label>
          <label className="field">
            <span>Scenario YAML</span>
            <textarea className="editor" value={scenarioYaml} onChange={(event) => setScenarioYaml(event.target.value)} spellCheck="false" />
          </label>
          {inputScenario && Object.entries(inputScenario.inputs).map(([name, input]) => (
            <label className="field" key={name}>
              <span>{name}{input.required ? " (required)" : ""}</span>
              <input
                value={inputValues[name] ?? displayInputValue(input.default)}
                onChange={(event) => setInputValues((values) => ({ ...values, [name]: event.target.value }))}
                placeholder={input.description}
                spellCheck="false"
              />
              <small>{input.description}</small>
            </label>
          ))}

          <fieldset className="mode-choice">
            <legend>Run mode</legend>
            <label><input type="radio" name="mode" checked={mode === "browser"} onChange={() => setMode("browser")} /> Browser</label>
            <p>Uses direct requests. The RPC endpoints must allow browser CORS access.</p>
            <label><input type="radio" name="mode" checked={mode === "vercel"} onChange={() => setMode("vercel")} /> Stateless Vercel route</label>
            <p>Uses public HTTPS endpoints. It allows up to 20 actions. It blocks fuzzing, credential headers, write RPC methods, and write HTTP methods.</p>
          </fieldset>
          <button className="run-button" type="button" onClick={run} disabled={busy || !baseline || !candidate}>
            {busy ? "Running…" : "Run differential test"}
          </button>
          {error && <p className="form-error" role="alert">{error}</p>}
        </section>

        <section className="panel report-panel" aria-live="polite">
          <div className="panel-heading">
            <div><span className="eyebrow">Output</span><h2>Protocol diff report</h2></div>
            {report && <span className={`status-label ${report.has_findings ? "finding" : ""}`}>{report.has_findings ? "Finding" : "Matched"}</span>}
          </div>
          {report?.probe && <p className="probe-report-context">{report.probe.upgrade} · {report.probe.eips.join(", ")} · {report.probe.category} · {report.probe.risk} risk</p>}
          {!report && <p className="empty-report">Run a scenario to view response differences.</p>}
          {report?.actions.map((action) => (
            <article className="action-report" key={action.id}>
              <div><strong>{action.id}</strong><span>{action.diffs.length} difference{action.diffs.length === 1 ? "" : "s"}</span></div>
              {action.baseline.error && <p className="operation-error">Baseline: {action.baseline.error}</p>}
              {action.candidate.error && <p className="operation-error">Candidate: {action.candidate.error}</p>}
              {action.assertion_failures.map((failure, index) => <p className="assertion-failure" key={`${failure.target}-${failure.path}-${index}`}>{failure.target} does not satisfy {failure.rule} at {failure.path || "the response root"}.</p>)}
              {action.diffs.length > 0 && <pre className="diff">{JSON.stringify(action.diffs, null, 2)}</pre>}
              {action.assertion_failures.length > 0 && <pre className="diff">{JSON.stringify(action.assertion_failures, null, 2)}</pre>}
            </article>
          ))}
        </section>
      </div>
    </section>
  );
}

async function loadRustComparator(): Promise<Comparator> {
  const modulePath = "/wasm/glamprobe.js";
  const wasm = await import(/* webpackIgnore: true */ modulePath) as unknown as RustWasm;
  await wasm.default();
  return wasm.compare_json;
}

function tryParseScenario(yamlSource: string) {
  try { return parseHostedScenario(yamlSource); } catch { return null; }
}

function displayInputValue(value: unknown): string {
  if (value === undefined) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function inputValuesFor(
  scenario: ReturnType<typeof tryParseScenario>,
  values: Record<string, string>,
): Record<string, unknown> {
  if (!scenario) return {};
  const output: Record<string, unknown> = {};
  for (const [name, input] of Object.entries(scenario.inputs)) {
    const value = values[name];
    if (value === undefined || value === "") continue;
    output[name] = input.kind === "json" ? JSON.parse(value) : value;
  }
  return output;
}
