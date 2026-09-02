const runs = [
  ["Glamsterdam gas sweep", "finding", "2 findings", "2,048 cases", "8 min ago"],
  ["Wallet transaction builder", "passed", "Passed", "64 cases", "1 h ago"],
  ["Indexer block replay", "passed", "Passed", "128 cases", "Yesterday"],
] as const;

export default function RunsPage() {
  return (
    <section className="content">
      <div className="page-heading compact"><div><div className="eyebrow">Execution history</div><h1>Runs</h1><p>Review target differences and download reproducible reports.</p></div><button className="primary-action" type="button">Start run</button></div>
      <section className="panel table-panel">
        <div className="table-head"><span>Name</span><span>Status</span><span>Coverage</span><span>Started</span></div>
        {runs.map(([name, kind, status, coverage, time]) => <article className="table-row" key={name}><strong>{name}</strong><span className={`status-label ${kind}`}>{status}</span><span>{coverage}</span><time>{time}</time></article>)}
      </section>
    </section>
  );
}
