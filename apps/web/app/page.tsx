"use client";

import { useState, type ChangeEvent } from "react";

import { parseHostedScenario } from "@/lib/hosted-scenario";
import { runPublicScenario, type Comparator, type PublicRunReport } from "@/lib/public-run";

const exampleScenario = `version: 1
name: chain-id-check
description: Compare the configured chain ID.
actions:
  - kind: rpc
    id: chain-id
    method: eth_chainId
    params: []
    comparison:
      ignore_paths: []
      numeric_tolerances: []
`;

type RunMode = "browser" | "vercel";
type RustWasm = { default: (input?: RequestInfo | URL | BufferSource | WebAssembly.Module) => Promise<unknown>; compare_json: Comparator };

export default function LocalRunPage() {
  const [scenarioYaml, setScenarioYaml] = useState(exampleScenario);
  const [baseline, setBaseline] = useState("");
  const [candidate, setCandidate] = useState("");
  const [mode, setMode] = useState<RunMode>("browser");
  const [report, setReport] = useState<PublicRunReport | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadScenario(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setScenarioYaml(await file.text());
    setReport(null);
    setError("");
  }

  async function run() {
    setBusy(true);
    setError("");
    setReport(null);
    try {
      const scenario = parseHostedScenario(scenarioYaml);
      if (mode === "browser") {
        const comparator = await loadRustComparator();
        setReport(await runPublicScenario(scenario, { endpoint: baseline }, { endpoint: candidate }, comparator));
      } else {
        const response = await fetch("/api/public/run", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ scenarioYaml, baseline, candidate }),
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
      <div className="eyebrow">No-login local run</div>
      <div className="page-heading compact">
        <div>
          <h1>Run a differential test without a Cloud account.</h1>
          <p>The page stores no scenario, endpoint, response, or account data. The browser loads the Rust comparison core as WebAssembly.</p>
        </div>
      </div>

      <div className="notice" role="note">
        <strong>Use test endpoints.</strong> Browser mode sends requests from this device. Server mode sends only read RPC requests through Vercel. Neither mode sends endpoint credentials.
      </div>

      <div className="workspace-grid">
        <section className="panel workspace-form" aria-label="Scenario and targets">
          <div className="panel-heading">
            <div><span className="eyebrow">Input</span><h2>Scenario and targets</h2></div>
            <label className="file-load">Load YAML<input type="file" accept=".yaml,.yml,text/yaml" onChange={loadScenario} /></label>
          </div>

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
            <div><span className="eyebrow">Output</span><h2>Diff report</h2></div>
            {report && <span className={`status-label ${report.has_findings ? "finding" : ""}`}>{report.has_findings ? "Finding" : "Matched"}</span>}
          </div>
          {!report && <p className="empty-report">Run a scenario to view response differences.</p>}
          {report?.actions.map((action) => (
            <article className="action-report" key={action.id}>
              <div><strong>{action.id}</strong><span>{action.diffs.length} difference{action.diffs.length === 1 ? "" : "s"}</span></div>
              {action.baseline.error && <p className="operation-error">Baseline: {action.baseline.error}</p>}
              {action.candidate.error && <p className="operation-error">Candidate: {action.candidate.error}</p>}
              {action.diffs.length > 0 && <pre className="diff">{JSON.stringify(action.diffs, null, 2)}</pre>}
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
