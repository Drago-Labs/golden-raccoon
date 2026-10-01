"use client";

export function AccountLineageWorkspace() {
  return (
    <section aria-labelledby="lineage-summary">
      <h2 id="lineage-summary">Creator lineage</h2>
      <label htmlFor="stellar-account">Stellar account</label>
      <input id="stellar-account" name="account" />
      <button type="button">Trace</button>
      <p>Coverage: the walk stops at the hop limit and does not treat missing history as a root.</p>
    </section>
  );
}
