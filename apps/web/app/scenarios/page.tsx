const probes = [
  ["CRITICAL", "Amsterdam Engine API surface", "EIP-7928", "Checks the Engine API methods that carry and validate block access lists."],
  ["CRITICAL", "Block access list retrieval", "EIP-7928", "Compares a post-fork payload body and its blockAccessList field."],
  ["HIGH", "Gas repricing estimates", "EIP-2780 · EIP-7981 · EIP-8037 · EIP-8038", "Compares transfer and access-list estimates at one post-fork block context."],
] as const;

export default function ScenariosPage() {
  return (
    <section className="content">
      <div className="page-heading compact">
        <div><div className="eyebrow">Glamsterdam probe catalog</div><h1>Protocol probes</h1><p>Each probe has a versioned EIP scope, required inputs, and a protocol risk level.</p></div>
        <a className="primary-action" href="/">Run a probe</a>
      </div>
      <section className="scenario-grid">
        {probes.map(([risk, name, eips, description]) => (
          <article className="panel scenario-card" key={name}>
            <span className="code-tag">{risk}</span><h2>{name}</h2><p>{description}</p><footer><span>{eips}</span><span>Glamsterdam</span></footer>
          </article>
        ))}
      </section>
    </section>
  );
}
