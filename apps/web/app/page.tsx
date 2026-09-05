"use client";

import { useEffect, useState, type ChangeEvent } from "react";

import type { ComparisonMode, RunConfiguration, RunReport, ScenarioView } from "@/lib/core-types";
import { defaultGlamsterdamProbe, glamsterdamProbes } from "@/lib/glamsterdam-probes";
import { validateNoLoginPlan } from "@/lib/public-policy";
import { runPublicPlan } from "@/lib/public-run";
import type { RustCore } from "@/lib/rust-core";

type TransportMode = "browser" | "vercel";
type BrowserRustWasm = RustCore & {
  default: (input?: RequestInfo | URL | BufferSource | WebAssembly.Module) => Promise<unknown>;
};

const browserBuild = "mobile-20260903-3";

export default function LocalRunPage() {
  const [scenarioYaml, setScenarioYaml] = useState<string>(defaultGlamsterdamProbe.yaml);
  const [selectedProbe, setSelectedProbe] = useState<string>(defaultGlamsterdamProbe.id);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [baseline, setBaseline] = useState("");
  const [candidate, setCandidate] = useState("");
  const [transportMode, setTransportMode] = useState<TransportMode>("browser");
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>(defaultGlamsterdamProbe.comparisonMode);
  const [baselineProtocol, setBaselineProtocol] = useState("osaka");
  const [candidateProtocol, setCandidateProtocol] = useState("glamsterdam");
  const [baselineClient, setBaselineClient] = useState("");
  const [candidateClient, setCandidateClient] = useState("");
  const [baselineStateFingerprint, setBaselineStateFingerprint] = useState("");
  const [candidateStateFingerprint, setCandidateStateFingerprint] = useState("");
  const [controlReason, setControlReason] = useState("");
  const [historicalForkBoundary, setHistoricalForkBoundary] = useState(false);
  const [allowModeOverride, setAllowModeOverride] = useState(false);
  const [modeOverrideReason, setModeOverrideReason] = useState("");
  const [report, setReport] = useState<RunReport | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showYaml, setShowYaml] = useState(false);
  const [inputScenario, setInputScenario] = useState<ScenarioView | null>(null);
  const [scenarioError, setScenarioError] = useState("");
  const [browserReady, setBrowserReady] = useState(false);
  const needsEngineCli = inputScenario?.actions.some((action) => action.kind === "rpc" && action.method.startsWith("engine_")) ?? false;
  const targetLabel = needsEngineCli ? "Engine API endpoint" : inputScenario?.actions.some((action) => action.kind === "http") ? "Builder API base URL" : "Execution RPC endpoint";
  const requiredInputsMissing = inputScenario ? Object.entries(inputScenario.inputs).some(([name, input]) => input.required && !(inputValues[name] ?? displayInputValue(input.default)).trim()) : false;
  const currentConfiguration = makeRunConfiguration({
    comparisonMode,
    baselineProtocol,
    candidateProtocol,
    baselineClient,
    candidateClient,
    baselineStateFingerprint,
    candidateStateFingerprint,
    controlReason,
    baseline,
    candidate,
    historicalForkBoundary,
    allowModeOverride,
    modeOverrideReason,
  });
  const cliCommand = buildCliCommand(selectedProbe, inputScenario, inputValues, baseline, candidate, needsEngineCli, currentConfiguration);
  const baselineRole = comparisonMode === "upgrade_differential" ? "Pre-upgrade baseline" : comparisonMode === "client_differential" ? "Client A baseline" : "Control baseline";
  const candidateRole = comparisonMode === "upgrade_differential" ? "Post-upgrade candidate" : comparisonMode === "client_differential" ? "Client B candidate" : "Control candidate";

  useEffect(() => {
    document.documentElement.setAttribute("data-dcept-started", "true");
    const readyTimer = window.setTimeout(() => setBrowserReady(true), 650);
    return () => window.clearTimeout(readyTimer);
  }, []);

  useEffect(() => {
    let current = true;
    void loadRustCore()
      .then((rust) => {
        if (!current) return;
        setInputScenario(rust.parse_scenario(scenarioYaml));
        setScenarioError("");
      })
      .catch((reason) => {
        if (!current) return;
        setInputScenario(null);
        setScenarioError(reason instanceof Error ? reason.message : "The scenario is invalid.");
      });
    return () => { current = false; };
  }, [scenarioYaml]);

  async function loadScenario(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setScenarioYaml(await file.text());
    setSelectedProbe("custom");
    setShowYaml(true);
    setInputValues({});
    setReport(null);
    setError("");
  }

  async function run() {
    setBusy(true);
    setError("");
    setReport(null);
    try {
      if (needsEngineCli) throw new Error("This probe calls the authenticated Engine API. Copy and run the local CLI command below.");
      const inputs = inputValuesFor(inputScenario, inputValues);
      const rust = await loadRustCore();
      const configuration = currentConfiguration;
      const plan = rust.plan_configured_scenario(scenarioYaml, inputs, configuration);
      const policyError = validateNoLoginPlan(plan);
      if (policyError) throw new Error(policyError);
      if (transportMode === "browser") {
        setReport(await runPublicPlan(plan, { endpoint: baseline }, { endpoint: candidate }, rust.evaluate_run));
      } else {
        const response = await fetch("/api/public/run", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ scenarioYaml, baseline, candidate, inputs, configuration }),
        });
        const result = await response.json() as RunReport | { error: string };
        if (!response.ok || "error" in result) throw new Error("error" in result ? result.error : "The no-login server runner failed.");
        setReport(result);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The run failed.");
    } finally {
      setBusy(false);
    }
  }

  async function copyCliCommand() {
    try {
      await navigator.clipboard.writeText(cliCommand);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setError("Could not copy the command. Select it and copy it manually.");
    }
  }

  function downloadScenario() {
    downloadFile(`${selectedProbe === "custom" ? "dcept-scenario" : replaceEvery(selectedProbe, "/", "-")}.yaml`, scenarioYaml, "text/yaml");
  }

  function downloadReport() {
    if (!report) return;
    downloadFile(`${report.scenario_name}-report.json`, JSON.stringify(report, null, 2), "application/json");
  }

  function selectComparisonMode(mode: ComparisonMode) {
    setComparisonMode(mode);
    if (mode === "upgrade_differential") {
      setBaselineProtocol("osaka");
      setCandidateProtocol("glamsterdam");
    }
    if (mode === "client_differential") {
      setBaselineProtocol("glamsterdam");
      setCandidateProtocol("glamsterdam");
    }
  }

  if (!browserReady) {
    return (
      <>
        <section id="dcept-startup-loading" className="startup-screen" role="status" aria-live="polite" aria-busy="true">
          <div className="startup-shell">
            <div className="startup-loader" aria-hidden="true">
              <span className="startup-orbit" />
              <img src="/brand/dcept-mark.svg" alt="" width="42" height="42" />
            </div>
            <div className="startup-copy">
              <div className="eyebrow">Local runtime</div>
              <h1>Preparing DCEPT</h1>
              <p>Loading the test engine and probe definitions on this device.</p>
            </div>
            <div className="startup-progress" aria-hidden="true"><span /></div>
            <p id="dcept-runtime-status" className="startup-status" data-started="false">Starting browser application · {browserBuild}</p>
          </div>
        </section>

        <section id="dcept-startup-failure" className="startup-screen startup-failure" role="alert" aria-live="assertive" hidden>
          <div className="startup-shell">
            <div className="startup-failure-mark" aria-hidden="true">
              <img src="/brand/dcept-mark.svg" alt="" width="38" height="38" />
            </div>
            <div className="startup-copy">
              <div className="eyebrow">Desktop browser required</div>
              <h1>Continue on a desktop computer.</h1>
              <p>This mobile browser cannot start the local DCEPT test engine. Use a desktop browser to configure targets and run differential probes.</p>
            </div>
            <div className="startup-next-step">
              <span>Next step</span>
              <strong>Open this same address in a current desktop browser.</strong>
            </div>
            <a className="secondary-button startup-retry" href="/">Try this device again</a>
          </div>
        </section>
      </>
    );
  }

  return (
    <section className="content local-workspace">
      <header className="page-intro">
        <div className="eyebrow">Local differential workspace</div>
        <h1>Test an Ethereum protocol transition.</h1>
        <p>Run one scenario against baseline and candidate rules. DCEPT checks state equivalence before it makes a compatibility claim.</p>
        <div className="runtime-note" role="note">
          <span className="runtime-dot" aria-hidden="true" />
          <span id="dcept-runtime-status" data-started="true">Browser application started. Build {browserBuild}.</span>
        </div>
      </header>

      <div className="workspace-grid">
        <section className="panel workspace-form" aria-label="Differential test settings">
          <div className="section-heading">
            <div><span className="step-number">01</span><div><h2>Select a probe</h2><p>Use a built-in probe or load a YAML scenario.</p></div></div>
            <div className="form-actions">
              <button className="text-button" type="button" onClick={downloadScenario}>Download YAML</button>
              <label className="file-load">Load YAML<input type="file" accept=".yaml,.yml,text/yaml" onChange={loadScenario} /></label>
            </div>
          </div>
          <div className="form-section">
            <label className="field">
              <span>Probe</span>
              <select value={selectedProbe} onChange={(event) => {
                const probe = glamsterdamProbes.find((candidate) => candidate.id === event.target.value);
                setSelectedProbe(probe?.id ?? "custom");
                setShowYaml(!probe);
                if (probe) {
                  setScenarioYaml(probe.yaml);
                  setComparisonMode(probe.comparisonMode);
                  setControlReason(probe.comparisonMode === "control" ? probe.detail : "");
                  if (probe.comparisonMode === "client_differential") {
                    setBaselineProtocol("glamsterdam");
                    setCandidateProtocol("glamsterdam");
                  } else if (probe.comparisonMode === "upgrade_differential") {
                    setBaselineProtocol("osaka");
                    setCandidateProtocol("glamsterdam");
                  }
                }
                setInputValues({});
                setReport(null);
                setError("");
              }}>
                {glamsterdamProbes.map((probe) => <option key={probe.id} value={probe.id}>{probe.title}</option>)}
                <option value="custom">Custom YAML scenario</option>
              </select>
            </label>
            {selectedProbe !== "custom" && <p className="field-note">{glamsterdamProbes.find((probe) => probe.id === selectedProbe)?.detail}</p>}
            {inputScenario?.probe && (
              <div className="probe-meta" aria-label="Probe evidence">
                <span>{inputScenario.probe.upgrade}</span>
                <span>{inputScenario.probe.eips.join(", ")}</span>
                <span>{inputScenario.probe.risk} risk</span>
                {inputScenario.probe.fixture_release && <span>{inputScenario.probe.fixture_release}</span>}
                {inputScenario.probe.sources.length > 0 && <span>Sources {inputScenario.probe.sources.map((source, index) => <a key={source} href={source} target="_blank" rel="noreferrer">{index + 1}</a>)}</span>}
              </div>
            )}
          </div>

          <div className="section-heading section-divider">
            <div><span className="step-number">02</span><div><h2>Set the comparison</h2><p>Select the claim that this run can make.</p></div></div>
          </div>
          <div className="form-section">
            <label className="field mode-select-mobile">
              <span>Comparison mode</span>
              <select
                value={comparisonMode}
                onInput={(event) => selectComparisonMode(event.currentTarget.value as ComparisonMode)}
                onChange={(event) => selectComparisonMode(event.currentTarget.value as ComparisonMode)}
              >
                <option value="upgrade_differential">Upgrade — pre-rules vs post-rules</option>
                <option value="client_differential">Client — implementation consistency</option>
                <option value="control">Control — DCEPT self-test</option>
              </select>
            </label>
            <fieldset className="mode-selector" role="radiogroup">
              <legend className="sr-only">Comparison mode</legend>
              <button type="button" role="radio" aria-checked={comparisonMode === "upgrade_differential"} className={comparisonMode === "upgrade_differential" ? "selected" : ""} onClick={() => selectComparisonMode("upgrade_differential")} onTouchEnd={() => selectComparisonMode("upgrade_differential")}>
                <strong>Upgrade</strong><small>Pre-rules vs post-rules</small>
              </button>
              <button type="button" role="radio" aria-checked={comparisonMode === "client_differential"} className={comparisonMode === "client_differential" ? "selected" : ""} onClick={() => selectComparisonMode("client_differential")} onTouchEnd={() => selectComparisonMode("client_differential")}>
                <strong>Client</strong><small>Implementation consistency</small>
              </button>
              <button type="button" role="radio" aria-checked={comparisonMode === "control"} className={comparisonMode === "control" ? "selected" : ""} onClick={() => selectComparisonMode("control")} onTouchEnd={() => selectComparisonMode("control")}>
                <strong>Control</strong><small>DCEPT self-test</small>
              </button>
            </fieldset>
            {comparisonMode !== "control" && (
              <div className="field-grid">
                <label className="field"><span>Baseline protocol</span><input value={baselineProtocol} onChange={(event) => setBaselineProtocol(event.target.value)} placeholder="osaka" /></label>
                <label className="field"><span>Candidate protocol</span><input value={candidateProtocol} onChange={(event) => setCandidateProtocol(event.target.value)} placeholder="glamsterdam" /></label>
                <label className="field"><span>Baseline state fingerprint</span><input value={baselineStateFingerprint} onChange={(event) => setBaselineStateFingerprint(event.target.value)} placeholder="sha256:shared-state" /></label>
                <label className="field"><span>Candidate state fingerprint</span><input value={candidateStateFingerprint} onChange={(event) => setCandidateStateFingerprint(event.target.value)} placeholder="Must match baseline" /></label>
                <p className="field-note full-width">DCEPT needs matching state fingerprints for a definitive result.</p>
              </div>
            )}
            {comparisonMode === "client_differential" && (
              <div className="field-grid">
                <label className="field"><span>Baseline client</span><input value={baselineClient} onChange={(event) => setBaselineClient(event.target.value)} placeholder="geth" /></label>
                <label className="field"><span>Candidate client</span><input value={candidateClient} onChange={(event) => setCandidateClient(event.target.value)} placeholder="reth" /></label>
              </div>
            )}
            {comparisonMode === "control" && <label className="field"><span>Control reason</span><input value={controlReason} onChange={(event) => setControlReason(event.target.value)} placeholder="State the known difference that this run must detect." required /></label>}
          </div>

          <div className="section-heading section-divider">
            <div><span className="step-number">03</span><div><h2>Connect the targets</h2><p>Use isolated test endpoints with known protocol rules.</p></div></div>
          </div>
          <div className="form-section">
            <div className="target-grid">
              <label className="field target-field">
                <span><b>A</b>{baselineRole}</span>
                <input value={baseline} onChange={(event) => setBaseline(event.target.value)} placeholder="https://baseline.example/rpc" inputMode="url" />
                <small>{targetLabel}</small>
              </label>
              <label className="field target-field">
                <span><b>B</b>{candidateRole}</span>
                <input value={candidate} onChange={(event) => setCandidate(event.target.value)} placeholder="https://candidate.example/rpc" inputMode="url" />
                <small>{targetLabel}</small>
              </label>
            </div>
            {inputScenario && Object.entries(inputScenario.inputs).length > 0 && (
              <div className="scenario-inputs">
                <h3>Scenario inputs</h3>
                <div className="field-grid">
                  {Object.entries(inputScenario.inputs).map(([name, input]) => (
                    <label className="field" key={name}>
                      <span>{name}{input.required ? " *" : ""}</span>
                      <input value={inputValues[name] ?? displayInputValue(input.default)} onChange={(event) => setInputValues((values) => ({ ...values, [name]: event.target.value }))} placeholder={input.description} spellCheck="false" />
                      <small>{input.description}</small>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="section-heading section-divider">
            <div><span className="step-number">04</span><div><h2>Run the probe</h2><p>Select where the network requests run.</p></div></div>
          </div>
          <div className="form-section">
            {needsEngineCli ? (
              <section className="cli-guide" aria-label="Local CLI command">
                <div><strong>Local CLI required</strong><p>This probe uses the authenticated Engine API. DCEPT keeps both JWT values on your device.</p></div>
                <pre>{cliCommand}</pre>
                <button className="secondary-button" type="button" onClick={copyCliCommand}>{copied ? "Copied" : "Copy CLI command"}</button>
                {requiredInputsMissing && <p className="form-error">Complete the required inputs before you run this command.</p>}
              </section>
            ) : (
              <>
                <fieldset className="transport-selector">
                  <legend className="sr-only">Execution host</legend>
                  <label className={transportMode === "browser" ? "selected" : ""}><input type="radio" name="transport-mode" checked={transportMode === "browser"} onChange={() => setTransportMode("browser")} /><span><strong>Browser</strong><small>Direct requests. CORS is required.</small></span></label>
                  <label className={transportMode === "vercel" ? "selected" : ""}><input type="radio" name="transport-mode" checked={transportMode === "vercel"} onChange={() => setTransportMode("vercel")} /><span><strong>Vercel route</strong><small>Public read requests. No stored data.</small></span></label>
                </fieldset>
                <button className="run-button" type="button" onClick={run} disabled={busy || !baseline || !candidate || requiredInputsMissing || (comparisonMode === "control" && !controlReason.trim()) || (allowModeOverride && !modeOverrideReason.trim())}>
                  <span>{busy ? "Running probe…" : "Run differential"}</span><span aria-hidden="true">→</span>
                </button>
              </>
            )}
            <details className="advanced-settings">
              <summary>Advanced settings</summary>
              <div className="advanced-content">
                {comparisonMode === "upgrade_differential" && <label className="check-field"><input type="checkbox" checked={historicalForkBoundary} onChange={(event) => setHistoricalForkBoundary(event.target.checked)} /> This scenario tests historical fork-boundary RPC behavior.</label>}
                {comparisonMode !== "control" && <><label className="check-field"><input type="checkbox" checked={allowModeOverride} onChange={(event) => setAllowModeOverride(event.target.checked)} /> Override mode identity protection.</label>{allowModeOverride && <label className="field"><span>Override reason</span><input value={modeOverrideReason} onChange={(event) => setModeOverrideReason(event.target.value)} required /></label>}</>}
              </div>
            </details>
            <details className="advanced-settings scenario-editor" open={showYaml} onToggle={(event) => setShowYaml(event.currentTarget.open)}>
              <summary>Scenario YAML</summary>
              <div className="advanced-content"><label className="field"><span>YAML source</span><textarea className="editor" value={scenarioYaml} onChange={(event) => { setScenarioYaml(event.target.value); setSelectedProbe("custom"); setShowYaml(true); }} spellCheck="false" /></label></div>
            </details>
            {(error || scenarioError) && <p className="form-error" role="alert">{error || scenarioError}</p>}
          </div>
        </section>

        <aside className="panel report-panel" aria-live="polite">
          <div className="report-header">
            <div><span className="eyebrow">Result</span><h2>Differential report</h2></div>
            {report && <button className="icon-button" type="button" onClick={downloadReport} aria-label="Download report JSON">↓</button>}
          </div>
          {!report ? (
            <div className="empty-report">
              <div className="empty-mark" aria-hidden="true"><span>A</span><i /><span>B</span></div>
              <h3>No run result</h3>
              <p>Complete the settings and run the probe. DCEPT will show each exact response difference here.</p>
            </div>
          ) : (
            <>
              <section className={`report-summary status-${report.status}`}>
                <div className="report-status"><span className="status-dot" /><strong>{replaceEvery(report.status, "_", " ")}</strong></div>
                <h3>{report.conclusion}</h3>
                <dl>
                  <div><dt>Mode</dt><dd>{modeLabel(report.comparison_mode)}</dd></div>
                  <div><dt>State</dt><dd>{replaceEvery(report.state_equivalence_status, "_", " ")}</dd></div>
                  <div><dt>Actions</dt><dd>{report.actions.length}</dd></div>
                  <div><dt>Findings</dt><dd>{report.actions.reduce((count, action) => count + action.diffs.length + action.assertion_failures.length, 0)}</dd></div>
                </dl>
                <p>{report.mode_description}</p>
                {report.warnings.map((warning) => <p className="report-warning" key={warning}>{warning}</p>)}
              </section>
              {report.probe && <div className="report-context"><span>{report.probe.upgrade}</span><span>{report.probe.eips.join(", ")}</span><span>{report.probe.risk} risk</span></div>}
              <div className="action-list">
                {report.actions.map((action) => {
                  const findingCount = action.diffs.length + action.assertion_failures.length;
                  return (
                    <details className="action-report" key={action.id} open={findingCount > 0}>
                      <summary><span><i className={findingCount > 0 ? "finding-dot" : "matched-dot"} />{action.id}</span><small>{findingCount} finding{findingCount === 1 ? "" : "s"}</small></summary>
                      <div className="action-content">
                        {action.baseline.error && <p className="operation-error">Baseline: {action.baseline.error}</p>}
                        {action.candidate.error && <p className="operation-error">Candidate: {action.candidate.error}</p>}
                        {action.assertion_failures.map((failure, index) => <p className="assertion-failure" key={`${failure.target}-${failure.path}-${index}`}>{failure.target} does not satisfy {failure.rule} at {failure.path || "the response root"}.</p>)}
                        {action.diffs.length > 0 && <><h4>Response differences</h4><pre className="diff">{JSON.stringify(action.diffs, null, 2)}</pre></>}
                        {action.assertion_failures.length > 0 && <><h4>Assertion failures</h4><pre className="diff">{JSON.stringify(action.assertion_failures, null, 2)}</pre></>}
                        {findingCount === 0 && <p className="matched-message">Baseline and candidate responses match.</p>}
                      </div>
                    </details>
                  );
                })}
              </div>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}

async function loadRustCore(): Promise<BrowserRustWasm> {
  const modulePath = "/wasm/dcept.js";
  const wasm = await import(/* webpackIgnore: true */ modulePath) as unknown as BrowserRustWasm;
  await wasm.default();
  return wasm;
}

function displayInputValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function inputValuesFor(
  scenario: ScenarioView | null,
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

function buildCliCommand(
  selectedProbe: string,
  scenario: ScenarioView | null,
  inputValues: Record<string, string>,
  baseline: string,
  candidate: string,
  needsEngineCli: boolean,
  configuration: RunConfiguration,
): string {
  const target = (value: string, placeholder: string) => shellQuote(value || placeholder);
  const command = selectedProbe === "custom" ? "dcept run scenario.yaml" : `dcept probe run ${selectedProbe}`;
  const lines = [command, `  --baseline ${target(baseline, "http://baseline-engine.example")}`, `  --candidate ${target(candidate, "http://candidate-engine.example")}`];
  lines.push(`  --mode ${replaceEvery(configuration.comparison_mode, "_", "-")}`);
  for (const [flag, value] of [
    ["baseline-protocol", configuration.baseline_protocol],
    ["candidate-protocol", configuration.candidate_protocol],
    ["baseline-client", configuration.baseline_client],
    ["candidate-client", configuration.candidate_client],
    ["baseline-state-fingerprint", configuration.baseline_state_fingerprint],
    ["candidate-state-fingerprint", configuration.candidate_state_fingerprint],
    ["control-reason", configuration.control_reason],
    ["mode-override-reason", configuration.mode_override_reason],
  ] as const) {
    if (value) lines.push(`  --${flag} ${shellQuote(value)}`);
  }
  if (configuration.historical_fork_boundary) lines.push("  --historical-fork-boundary");
  if (configuration.allow_mode_override) lines.push("  --allow-mode-override");
  if (scenario) {
    for (const [name, input] of Object.entries(scenario.inputs)) {
      const value = inputValues[name] || displayInputValue(input.default);
      if (value) lines.push(`  --var ${shellQuote(`${name}=${value}`)}`);
    }
  }
  if (needsEngineCli) {
    lines.push("  --baseline-header 'Authorization: Bearer <BASELINE_JWT>'");
    lines.push("  --candidate-header 'Authorization: Bearer <CANDIDATE_JWT>'");
  }
  return lines.join(" \\\n");
}

function makeRunConfiguration(values: {
  comparisonMode: ComparisonMode;
  baselineProtocol: string;
  candidateProtocol: string;
  baselineClient: string;
  candidateClient: string;
  baselineStateFingerprint: string;
  candidateStateFingerprint: string;
  controlReason: string;
  baseline: string;
  candidate: string;
  historicalForkBoundary: boolean;
  allowModeOverride: boolean;
  modeOverrideReason: string;
}): RunConfiguration {
  const optional = (value: string) => value.trim() || null;
  return {
    comparison_mode: values.comparisonMode,
    baseline_protocol: values.comparisonMode === "control" ? null : optional(values.baselineProtocol),
    candidate_protocol: values.comparisonMode === "control" ? null : optional(values.candidateProtocol),
    baseline_client: values.comparisonMode === "client_differential" ? optional(values.baselineClient) : null,
    candidate_client: values.comparisonMode === "client_differential" ? optional(values.candidateClient) : null,
    baseline_state_fingerprint: values.comparisonMode === "control" ? null : optional(values.baselineStateFingerprint),
    candidate_state_fingerprint: values.comparisonMode === "control" ? null : optional(values.candidateStateFingerprint),
    control_reason: values.comparisonMode === "control" ? optional(values.controlReason) : null,
    same_target: normalizedEndpoint(values.baseline) === normalizedEndpoint(values.candidate),
    allow_mode_override: values.comparisonMode === "control" ? false : values.allowModeOverride,
    mode_override_reason: values.allowModeOverride ? optional(values.modeOverrideReason) : null,
    historical_fork_boundary: values.comparisonMode === "upgrade_differential" && values.historicalForkBoundary,
  };
}

function normalizedEndpoint(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function modeLabel(mode: ComparisonMode): string {
  if (mode === "upgrade_differential") return "Upgrade differential";
  if (mode === "client_differential") return "Client differential";
  return "Control";
}

function replaceEvery(value: string, search: string, replacement: string): string {
  return value.split(search).join(replacement);
}

function shellQuote(value: string): string {
  return `'${replaceEvery(value, "'", "'\\\"'\\\"'")}'`;
}

function downloadFile(name: string, contents: string, type: string) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
