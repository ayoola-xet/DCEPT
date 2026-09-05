"use client";

import { useCallback, useEffect, useState } from "react";

import { defaultGlamsterdamProbe } from "@/lib/glamsterdam-probes";
import type { ComparisonMode } from "@/lib/core-types";

type Target = { id: string; name: string; created_at: string };
type ScenarioInput = { description: string; kind: "string" | "address" | "quantity" | "block_tag" | "json"; required: boolean; default?: unknown };
type Scenario = { id: string; name: string; checksum: string; updated_at: string; inputs: Record<string, ScenarioInput> };
type ScenarioDetail = { id: string; name: string; yaml_source: string };
type Run = { id: string; status: string; scenario_name: string; comparison_mode: ComparisonMode; created_at: string; action_count: number };
type RunDetail = { id: string; status: string; created_at: string; completed_at: string | null; error_message: string | null; report_json: unknown | null };
type CloudData = { targets: Target[]; scenarios: Scenario[]; runs: Run[] };

export function CloudConsole() {
  const [data, setData] = useState<CloudData>({ targets: [], scenarios: [], runs: [] });
  const [state, setState] = useState<"loading" | "ready" | "signed-out" | "error">("loading");
  const [message, setMessage] = useState("");
  const [targetName, setTargetName] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [targetHeaders, setTargetHeaders] = useState("{}");
  const [editingTarget, setEditingTarget] = useState<string | null>(null);
  const [scenarioName, setScenarioName] = useState<string>(defaultGlamsterdamProbe.title);
  const [scenarioYaml, setScenarioYaml] = useState<string>(defaultGlamsterdamProbe.yaml);
  const [editingScenario, setEditingScenario] = useState<string | null>(null);
  const [runScenario, setRunScenario] = useState("");
  const [baselineTarget, setBaselineTarget] = useState("");
  const [candidateTarget, setCandidateTarget] = useState("");
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>("upgrade_differential");
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
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [selectedRun, setSelectedRun] = useState<RunDetail | null>(null);
  const selectedScenario = data.scenarios.find((scenario) => scenario.id === runScenario);

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

  const load = useCallback(async () => {
    setState("loading");
    setMessage("");
    try {
      const [targetsResponse, scenariosResponse, runsResponse] = await Promise.all([
        fetch("/api/v1/targets"), fetch("/api/v1/scenarios"), fetch("/api/v1/runs"),
      ]);
      if ([targetsResponse, scenariosResponse, runsResponse].some((response) => response.status === 401)) {
        setState("signed-out");
        return;
      }
      const responses = [targetsResponse, scenariosResponse, runsResponse];
      if (responses.some((response) => !response.ok)) throw new Error("Cloud data could not load. Check the Cloud environment values.");
      const [targets, scenarios, runs] = await Promise.all(responses.map((response) => response.json())) as [{ targets: Target[] }, { scenarios: Scenario[] }, { runs: Run[] }];
      setData({ targets: targets.targets, scenarios: scenarios.scenarios, runs: runs.runs });
      setRunScenario((current) => current || scenarios.scenarios[0]?.id || "");
      setBaselineTarget((current) => current || targets.targets[0]?.id || "");
      setCandidateTarget((current) => current || targets.targets[1]?.id || "");
      setState("ready");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Cloud data could not load.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    setInputValues(initialInputValues(selectedScenario));
  }, [selectedScenario]);

  async function createTarget(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    try {
      const headers = JSON.parse(targetHeaders) as Record<string, string>;
      const response = await fetch(editingTarget ? `/api/v1/targets/${editingTarget}` : "/api/v1/targets", {
        method: editingTarget ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: targetName, endpointUrl: targetUrl, headers }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      await load();
      setTargetName(""); setTargetUrl(""); setTargetHeaders("{}"); setEditingTarget(null);
      setMessage(editingTarget ? "Target updated." : "Target saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Target could not be saved.");
    }
  }

  async function createScenario(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    try {
      const response = await fetch(editingScenario ? `/api/v1/scenarios/${editingScenario}` : "/api/v1/scenarios", {
        method: editingScenario ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: scenarioName, yamlSource: scenarioYaml }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      await load();
      setEditingScenario(null);
      setMessage(editingScenario ? "Scenario updated." : "Scenario saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Scenario could not be saved.");
    }
  }

  async function startRun(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    try {
      const response = await fetch("/api/v1/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scenarioId: runScenario,
          baselineTargetId: baselineTarget,
          candidateTargetId: candidateTarget,
          inputValues: parseInputValues(selectedScenario, inputValues),
          comparisonMode,
          baselineProtocol,
          candidateProtocol,
          baselineClient,
          candidateClient,
          baselineStateFingerprint,
          candidateStateFingerprint,
          controlReason,
          historicalForkBoundary,
          allowModeOverride,
          modeOverrideReason,
        }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      setMessage("Cloud run queued.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Cloud run could not start.");
    }
  }

  async function openRun(id: string) {
    setMessage("");
    try {
      const response = await fetch(`/api/v1/runs/${id}`);
      if (!response.ok) throw new Error(await responseMessage(response));
      const body = await response.json() as { run: RunDetail };
      setSelectedRun(body.run);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Run details could not load.");
    }
  }

  async function cancelRun(id: string) {
    setMessage("");
    try {
      const response = await fetch(`/api/v1/runs/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await responseMessage(response));
      setMessage("Cloud run canceled.");
      if (selectedRun?.id === id) setSelectedRun((run) => run ? { ...run, status: "canceled" } : null);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Cloud run could not be canceled.");
    }
  }

  function editTarget(target: Target) {
    setEditingTarget(target.id);
    setTargetName(target.name);
    setTargetUrl("");
    setTargetHeaders("{}");
    setMessage("Enter a replacement endpoint and headers. Saved credentials stay hidden.");
  }

  async function deleteTarget(id: string) {
    setMessage("");
    try {
      const response = await fetch(`/api/v1/targets/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await responseMessage(response));
      if (editingTarget === id) { setEditingTarget(null); setTargetName(""); setTargetUrl(""); setTargetHeaders("{}"); }
      await load();
      setMessage("Target deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Target could not be deleted.");
    }
  }

  async function editScenario(id: string) {
    setMessage("");
    try {
      const response = await fetch(`/api/v1/scenarios/${id}`);
      if (!response.ok) throw new Error(await responseMessage(response));
      const body = await response.json() as { scenario: ScenarioDetail };
      setEditingScenario(id);
      setScenarioName(body.scenario.name);
      setScenarioYaml(body.scenario.yaml_source);
      setMessage("Edit the scenario and save it when ready.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Scenario could not load.");
    }
  }

  async function deleteScenario(id: string) {
    setMessage("");
    try {
      const response = await fetch(`/api/v1/scenarios/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await responseMessage(response));
      if (editingScenario === id) { setEditingScenario(null); setScenarioName(defaultGlamsterdamProbe.title); setScenarioYaml(defaultGlamsterdamProbe.yaml); }
      await load();
      setMessage("Scenario deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Scenario could not be deleted.");
    }
  }

  if (state === "loading") return <section className="panel cloud-empty"><span className="runtime-dot" /><h2>Loading Cloud workspace</h2><p>Checking the current Cloud session.</p></section>;
  if (state === "signed-out") return <section className="panel cloud-empty"><img src="/brand/dcept-mark.svg" alt="" width="34" height="34" /><h2>Connect a wallet for Cloud history</h2><p>Use the sign-in control above. The local workspace does not need a wallet.</p></section>;
  if (state === "error") return <section className="panel cloud-empty"><h2>Cloud is not ready</h2><p className="form-error">{message}</p></section>;

  return (
    <section className="cloud-console">
      <p className="cloud-message" role="status">{message}</p>
      <div className="cloud-grid">
        <form className="panel cloud-form" onSubmit={createTarget}>
          <div><span className="eyebrow">1. Secure targets</span><h2>{editingTarget ? "Rotate a target" : "Add a target"}</h2></div>
          <label className="field"><span>Name</span><input value={targetName} onChange={(event) => setTargetName(event.target.value)} required /></label>
          <label className="field"><span>HTTPS endpoint</span><input value={targetUrl} onChange={(event) => setTargetUrl(event.target.value)} type="url" required /></label>
          <label className="field"><span>Headers JSON</span><textarea value={targetHeaders} onChange={(event) => setTargetHeaders(event.target.value)} spellCheck="false" /></label>
          <button className="secondary-button" type="submit">{editingTarget ? "Update encrypted target" : "Save encrypted target"}</button>
          {editingTarget && <button className="text-button" type="button" onClick={() => { setEditingTarget(null); setTargetName(""); setTargetUrl(""); setTargetHeaders("{}"); }}>Cancel target edit</button>}
          <CloudResourceList title="Saved targets" items={data.targets} empty="No targets yet." editLabel="Rotate" onEdit={(target) => editTarget(target)} onDelete={(target) => void deleteTarget(target.id)} />
        </form>

        <form className="panel cloud-form" onSubmit={createScenario}>
          <div><span className="eyebrow">2. Versioned scenarios</span><h2>{editingScenario ? "Edit a scenario" : "Save a scenario"}</h2></div>
          <label className="field"><span>Name</span><input value={scenarioName} onChange={(event) => setScenarioName(event.target.value)} required /></label>
          <label className="field"><span>YAML</span><textarea className="cloud-editor" value={scenarioYaml} onChange={(event) => setScenarioYaml(event.target.value)} spellCheck="false" required /></label>
          <button className="secondary-button" type="submit">{editingScenario ? "Update scenario" : "Save scenario"}</button>
          {editingScenario && <button className="text-button" type="button" onClick={() => { setEditingScenario(null); setScenarioName(defaultGlamsterdamProbe.title); setScenarioYaml(defaultGlamsterdamProbe.yaml); }}>Cancel scenario edit</button>}
          <CloudResourceList title="Saved scenarios" items={data.scenarios} empty="No scenarios yet." onEdit={(scenario) => void editScenario(scenario.id)} onDelete={(scenario) => void deleteScenario(scenario.id)} />
        </form>
      </div>

      <form className="panel cloud-run-form" onSubmit={startRun}>
        <div><span className="eyebrow">3. Durable run</span><h2>Queue a Cloud probe</h2></div>
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
          <button type="button" role="radio" aria-checked={comparisonMode === "upgrade_differential"} className={comparisonMode === "upgrade_differential" ? "selected" : ""} onClick={() => selectComparisonMode("upgrade_differential")} onTouchEnd={() => selectComparisonMode("upgrade_differential")}><strong>Upgrade</strong><small>Pre-rules vs post-rules</small></button>
          <button type="button" role="radio" aria-checked={comparisonMode === "client_differential"} className={comparisonMode === "client_differential" ? "selected" : ""} onClick={() => selectComparisonMode("client_differential")} onTouchEnd={() => selectComparisonMode("client_differential")}><strong>Client</strong><small>Implementation consistency</small></button>
          <button type="button" role="radio" aria-checked={comparisonMode === "control"} className={comparisonMode === "control" ? "selected" : ""} onClick={() => selectComparisonMode("control")} onTouchEnd={() => selectComparisonMode("control")}><strong>Control</strong><small>DCEPT self-test</small></button>
        </fieldset>
        <label className="field"><span>Scenario</span><select value={runScenario} onChange={(event) => setRunScenario(event.target.value)} required><option value="">Select scenario</option>{data.scenarios.map((scenario) => <option value={scenario.id} key={scenario.id}>{scenario.name}</option>)}</select></label>
        <label className="field"><span>Baseline target</span><select value={baselineTarget} onChange={(event) => setBaselineTarget(event.target.value)} required><option value="">Select target</option>{data.targets.map((target) => <option value={target.id} key={target.id}>{target.name}</option>)}</select></label>
        <label className="field"><span>Candidate target</span><select value={candidateTarget} onChange={(event) => setCandidateTarget(event.target.value)} required><option value="">Select target</option>{data.targets.map((target) => <option value={target.id} key={target.id}>{target.name}</option>)}</select></label>
        {comparisonMode !== "control" && <div className="cloud-inputs"><strong>Protocol and state identity</strong><label className="field"><span>Baseline protocol</span><input value={baselineProtocol} onChange={(event) => setBaselineProtocol(event.target.value)} /></label><label className="field"><span>Candidate protocol</span><input value={candidateProtocol} onChange={(event) => setCandidateProtocol(event.target.value)} /></label><label className="field"><span>Baseline state fingerprint</span><input value={baselineStateFingerprint} onChange={(event) => setBaselineStateFingerprint(event.target.value)} /></label><label className="field"><span>Candidate state fingerprint</span><input value={candidateStateFingerprint} onChange={(event) => setCandidateStateFingerprint(event.target.value)} /></label></div>}
        {comparisonMode === "client_differential" && <div className="cloud-inputs"><strong>Client identity</strong><label className="field"><span>Baseline client</span><input value={baselineClient} onChange={(event) => setBaselineClient(event.target.value)} /></label><label className="field"><span>Candidate client</span><input value={candidateClient} onChange={(event) => setCandidateClient(event.target.value)} /></label></div>}
        {comparisonMode === "control" && <label className="field"><span>Control reason</span><input value={controlReason} onChange={(event) => setControlReason(event.target.value)} required /></label>}
        {comparisonMode === "upgrade_differential" && <label className="check-field"><input type="checkbox" checked={historicalForkBoundary} onChange={(event) => setHistoricalForkBoundary(event.target.checked)} /> Explicit historical fork-boundary probe</label>}
        {comparisonMode !== "control" && <div><label className="check-field"><input type="checkbox" checked={allowModeOverride} onChange={(event) => setAllowModeOverride(event.target.checked)} /> Override mode identity protection</label>{allowModeOverride && <label className="field"><span>Override reason</span><input value={modeOverrideReason} onChange={(event) => setModeOverrideReason(event.target.value)} required /></label>}</div>}
        {selectedScenario && Object.keys(selectedScenario.inputs).length > 0 && <div className="cloud-inputs"><strong>Scenario inputs</strong>{Object.entries(selectedScenario.inputs).map(([name, input]) => <label className="field" key={name}><span>{name}{input.required ? " *" : ""}</span>{input.kind === "json" ? <textarea value={inputValues[name] ?? ""} onChange={(event) => setInputValues((values) => ({ ...values, [name]: event.target.value }))} placeholder={input.description} required={input.required} spellCheck="false" /> : <input value={inputValues[name] ?? ""} onChange={(event) => setInputValues((values) => ({ ...values, [name]: event.target.value }))} placeholder={input.description} required={input.required} />}</label>)}</div>}
        <button className="run-button" type="submit" disabled={!runScenario || !baselineTarget || !candidateTarget || hasMissingRequiredInput(selectedScenario, inputValues) || (comparisonMode === "control" && !controlReason.trim()) || (allowModeOverride && !modeOverrideReason.trim())}>Queue Cloud run</button>
      </form>

      <section className="panel cloud-runs">
        <div><span className="eyebrow">Recent Cloud runs</span><h2>Run history</h2></div>
        {data.runs.length === 0 ? <p className="empty-report">No Cloud runs yet.</p> : <div className="run-list">{data.runs.map((run) => <article className="run-row" key={run.id}><span className={`status-dot ${run.status === "completed" ? "passed" : "finding"}`} /><div><strong>{run.scenario_name}</strong><span>{run.comparison_mode} · {run.action_count} actions</span></div><span className="status-label">{run.status}</span><div className="cloud-run-actions"><button className="text-button" type="button" onClick={() => void openRun(run.id)}>View</button>{["queued", "running"].includes(run.status) && <button className="text-button warning-button" type="button" onClick={() => void cancelRun(run.id)}>Cancel</button>}</div></article>)}</div>}
      </section>
      {selectedRun && <section className="panel cloud-run-detail"><div><span className="eyebrow">Run detail</span><h2>{selectedRun.status}</h2></div>{selectedRun.error_message && <p className="form-error">{selectedRun.error_message}</p>}{selectedRun.report_json ? <pre>{JSON.stringify(selectedRun.report_json, null, 2)}</pre> : <p className="empty-report">The run has no report yet.</p>}</section>}
    </section>
  );
}

function CloudResourceList<T extends { id: string; name: string }>({ title, items, empty, editLabel = "Edit", onEdit, onDelete }: { title: string; items: T[]; empty: string; editLabel?: string; onEdit: (item: T) => void; onDelete: (item: T) => void }) {
  return <div className="cloud-list"><strong>{title}</strong>{items.length === 0 ? <span>{empty}</span> : items.map((item) => <div className="cloud-resource" key={item.id}><span>{item.name}</span><span><button className="text-button" type="button" onClick={() => onEdit(item)}>{editLabel}</button><button className="text-button warning-button" type="button" onClick={() => onDelete(item)}>Delete</button></span></div>)}</div>;
}

async function responseMessage(response: Response): Promise<string> {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return body?.error || `Cloud request failed with HTTP ${response.status}.`;
}

function initialInputValues(scenario: Scenario | undefined): Record<string, string> {
  if (!scenario) return {};
  return Object.fromEntries(Object.entries(scenario.inputs).flatMap(([name, input]) => input.default == null ? [] : [[name, input.kind === "json" ? JSON.stringify(input.default) : String(input.default)]]));
}

function parseInputValues(scenario: Scenario | undefined, values: Record<string, string>): Record<string, unknown> {
  if (!scenario) throw new Error("Select a scenario.");
  return Object.fromEntries(Object.entries(scenario.inputs).flatMap(([name, input]) => {
    const value = values[name]?.trim() ?? "";
    if (!value) {
      if (input.required) throw new Error(`Input '${name}' is required.`);
      return [];
    }
    try {
      return [[name, input.kind === "json" ? JSON.parse(value) : value]];
    } catch {
      throw new Error(`Input '${name}' must contain valid JSON.`);
    }
  }));
}

function hasMissingRequiredInput(scenario: Scenario | undefined, values: Record<string, string>): boolean {
  return Object.entries(scenario?.inputs ?? {}).some(([name, input]) => input.required && !(values[name]?.trim()));
}
