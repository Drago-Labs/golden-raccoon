"use client";

export function GovernanceWorkspace() {
  return (
    <section aria-labelledby="governance-summary">
      <h2 id="governance-summary">Proposal list</h2>
      <label htmlFor="governor-address">Governor address</label>
      <input id="governor-address" name="governor" />
      <button type="button">Summarize</button>
      <p>Coverage: pinned blocks only. Unsupported governors are labeled unsupported.</p>
    </section>
  );
}
