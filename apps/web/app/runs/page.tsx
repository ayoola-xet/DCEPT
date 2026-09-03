export default function RunsPage() {
  return (
    <section className="content">
      <div className="page-heading compact">
        <div><div className="eyebrow">Optional Cloud history</div><h1>Cloud runs</h1><p>Cloud stores team run history, reports, quotas, and target credentials. The local probe workspace stores nothing.</p></div>
        <a className="primary-action" href="/">Run locally</a>
      </div>
      <section className="panel">
        <div className="panel-heading"><div><span className="eyebrow">No saved data in local mode</span><h2>Connect a wallet for Cloud history</h2></div></div>
        <p className="empty-report">Use the Cloud sign-in control when you want shared run records. Use the local workspace when you do not.</p>
      </section>
    </section>
  );
}
