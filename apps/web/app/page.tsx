const activity = [
  { name: "Glamsterdam gas sweep", state: "Finding", detail: "2 response differences", time: "8 min ago" },
  { name: "Wallet transaction builder", state: "Passed", detail: "64 scenarios", time: "1 h ago" },
  { name: "Indexer block replay", state: "Passed", detail: "128 scenarios", time: "Yesterday" },
];

export default function OverviewPage() {
  return (
    <section className="content">
      <div className="eyebrow">Ethereum upgrade readiness</div>
      <div className="page-heading">
        <div>
          <h1>Know what changes before users do.</h1>
          <p>Compare baseline and candidate targets with repeatable scenarios, fuzz cases, and clear findings.</p>
        </div>
        <a className="primary-action" href="/scenarios">Create scenario</a>
      </div>

      <section className="metric-grid" aria-label="Project metrics">
        <article><span>Active targets</span><strong>2</strong><small>Baseline and candidate</small></article>
        <article><span>Scenarios</span><strong>24</strong><small>6 run this week</small></article>
        <article><span>Open findings</span><strong className="warning">2</strong><small>Need review</small></article>
        <article><span>Compatibility</span><strong>98.4%</strong><small>Last 30 days</small></article>
      </section>

      <section className="panel activity-panel">
        <div className="panel-heading">
          <div><span className="eyebrow">Recent execution</span><h2>Compatibility runs</h2></div>
          <a href="/runs">View all runs</a>
        </div>
        <div className="run-list">
          {activity.map((run) => (
            <article className="run-row" key={run.name}>
              <span className={`status-dot ${run.state === "Finding" ? "finding" : "passed"}`} aria-label={run.state} />
              <div><strong>{run.name}</strong><span>{run.detail}</span></div>
              <span className={`status-label ${run.state === "Finding" ? "finding" : "passed"}`}>{run.state}</span>
              <time>{run.time}</time>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
