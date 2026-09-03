import { CloudConsole } from "@/components/cloud-console";

export default function RunsPage() {
  return (
    <section className="content">
      <div className="page-heading compact">
        <div><div className="eyebrow">Optional Cloud history</div><h1>Cloud runs</h1><p>Cloud stores team run history, reports, quotas, and target credentials. The local probe workspace stores nothing.</p></div>
        <a className="primary-action" href="/">Run locally</a>
      </div>
      <CloudConsole />
    </section>
  );
}
