"use client";

import { useCallback, useEffect, useState } from "react";

import { defaultGlamsterdamProbe } from "@/lib/glamsterdam-probes";

type Target = { id: string; name: string; created_at: string };
type Scenario = { id: string; name: string; checksum: string; updated_at: string };
type Run = { id: string; status: string; scenario_name: string; created_at: string; action_count: number };
type CloudData = { targets: Target[]; scenarios: Scenario[]; runs: Run[] };

export function CloudConsole() {
  const [data, setData] = useState<CloudData>({ targets: [], scenarios: [], runs: [] });
  const [state, setState] = useState<"loading" | "ready" | "signed-out" | "error">("loading");
  const [message, setMessage] = useState("");
  const [targetName, setTargetName] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [targetHeaders, setTargetHeaders] = useState("{}");
  const [scenarioName, setScenarioName] = useState<string>(defaultGlamsterdamProbe.title);
  const [scenarioYaml, setScenarioYaml] = useState<string>(defaultGlamsterdamProbe.yaml);
  const [runScenario, setRunScenario] = useState("");
  const [baselineTarget, setBaselineTarget] = useState("");
  const [candidateTarget, setCandidateTarget] = useState("");

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

  async function createTarget(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    try {
      const headers = JSON.parse(targetHeaders) as Record<string, string>;
      const response = await fetch("/api/v1/targets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: targetName, endpointUrl: targetUrl, headers }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      setTargetName(""); setTargetUrl(""); setTargetHeaders("{}");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Target could not be saved.");
    }
  }

  async function createScenario(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    try {
      const response = await fetch("/api/v1/scenarios", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: scenarioName, yamlSource: scenarioYaml }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      await load();
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
        body: JSON.stringify({ scenarioId: runScenario, baselineTargetId: baselineTarget, candidateTargetId: candidateTarget }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      setMessage("Cloud run queued.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Cloud run could not start.");
    }
  }

  if (state === "loading") return <section className="panel cloud-console"><p className="empty-report">Loading Cloud workspace.</p></section>;
  if (state === "signed-out") return <section className="panel cloud-console"><h2>Connect a wallet for Cloud history</h2><p className="empty-report">Use the Cloud sign-in control. Local mode does not need a wallet.</p></section>;
  if (state === "error") return <section className="panel cloud-console"><h2>Cloud is not ready</h2><p className="form-error">{message}</p></section>;

  return (
    <section className="cloud-console">
      <p className="cloud-message" role="status">{message}</p>
      <div className="cloud-grid">
        <form className="panel cloud-form" onSubmit={createTarget}>
          <div><span className="eyebrow">1. Secure targets</span><h2>Add a target</h2></div>
          <label className="field"><span>Name</span><input value={targetName} onChange={(event) => setTargetName(event.target.value)} required /></label>
          <label className="field"><span>HTTPS endpoint</span><input value={targetUrl} onChange={(event) => setTargetUrl(event.target.value)} type="url" required /></label>
          <label className="field"><span>Headers JSON</span><textarea value={targetHeaders} onChange={(event) => setTargetHeaders(event.target.value)} spellCheck="false" /></label>
          <button className="secondary-button" type="submit">Save encrypted target</button>
          <CloudList title="Saved targets" items={data.targets.map((target) => target.name)} empty="No targets yet." />
        </form>

        <form className="panel cloud-form" onSubmit={createScenario}>
          <div><span className="eyebrow">2. Versioned scenarios</span><h2>Save a scenario</h2></div>
          <label className="field"><span>Name</span><input value={scenarioName} onChange={(event) => setScenarioName(event.target.value)} required /></label>
          <label className="field"><span>YAML</span><textarea className="cloud-editor" value={scenarioYaml} onChange={(event) => setScenarioYaml(event.target.value)} spellCheck="false" required /></label>
          <button className="secondary-button" type="submit">Save scenario</button>
          <CloudList title="Saved scenarios" items={data.scenarios.map((scenario) => scenario.name)} empty="No scenarios yet." />
        </form>
      </div>

      <form className="panel cloud-run-form" onSubmit={startRun}>
        <div><span className="eyebrow">3. Durable run</span><h2>Queue a Cloud probe</h2></div>
        <label className="field"><span>Scenario</span><select value={runScenario} onChange={(event) => setRunScenario(event.target.value)} required><option value="">Select scenario</option>{data.scenarios.map((scenario) => <option value={scenario.id} key={scenario.id}>{scenario.name}</option>)}</select></label>
        <label className="field"><span>Baseline target</span><select value={baselineTarget} onChange={(event) => setBaselineTarget(event.target.value)} required><option value="">Select target</option>{data.targets.map((target) => <option value={target.id} key={target.id}>{target.name}</option>)}</select></label>
        <label className="field"><span>Candidate target</span><select value={candidateTarget} onChange={(event) => setCandidateTarget(event.target.value)} required><option value="">Select target</option>{data.targets.map((target) => <option value={target.id} key={target.id}>{target.name}</option>)}</select></label>
        <button className="run-button" type="submit" disabled={!runScenario || !baselineTarget || !candidateTarget || baselineTarget === candidateTarget}>Queue Cloud run</button>
      </form>

      <section className="panel cloud-runs">
        <div><span className="eyebrow">Recent Cloud runs</span><h2>Run history</h2></div>
        {data.runs.length === 0 ? <p className="empty-report">No Cloud runs yet.</p> : <div className="run-list">{data.runs.map((run) => <article className="run-row" key={run.id}><span className={`status-dot ${run.status === "completed" ? "passed" : "finding"}`} /><div><strong>{run.scenario_name}</strong><span>{run.action_count} actions</span></div><span className="status-label">{run.status}</span><time>{new Date(run.created_at).toLocaleString()}</time></article>)}</div>}
      </section>
    </section>
  );
}

function CloudList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return <div className="cloud-list"><strong>{title}</strong>{items.length === 0 ? <span>{empty}</span> : items.map((item) => <span key={item}>{item}</span>)}</div>;
}

async function responseMessage(response: Response): Promise<string> {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return body?.error || `Cloud request failed with HTTP ${response.status}.`;
}
