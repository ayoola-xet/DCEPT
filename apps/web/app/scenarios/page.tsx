export default function ScenariosPage() {
  return (
    <section className="content">
      <div className="page-heading compact"><div><div className="eyebrow">Source-controlled test definitions</div><h1>Scenarios</h1><p>Declare equivalent target operations in versioned YAML.</p></div><button className="primary-action" type="button">Upload YAML</button></div>
      <section className="scenario-grid">
        <article className="panel scenario-card"><span className="code-tag">RPC</span><h2>transfer-to-fresh-address</h2><p>Compare gas estimation for a one-wei transfer to a fresh address.</p><footer><span>eth_estimateGas</span><span>Updated today</span></footer></article>
        <article className="panel scenario-card"><span className="code-tag">FUZZ</span><h2>Glamsterdam gas sweep</h2><p>Generate deterministic value variants and compare estimate results.</p><footer><span>2,048 cases</span><span>Seed 42</span></footer></article>
        <article className="panel scenario-card"><span className="code-tag">HTTP</span><h2>indexer health</h2><p>Check downstream response compatibility across target environments.</p><footer><span>GET /health</span><span>Updated yesterday</span></footer></article>
      </section>
    </section>
  );
}
