"use client";

export function AuditCoverageWorkspace() {
  return (
    <section aria-labelledby="audit-summary">
      <h2 id="audit-summary">Coverage matrix</h2>
      <label htmlFor="audit-contract">Contract address</label>
      <input id="audit-contract" name="contract" />
      <button type="button">Match audits</button>
      <p>Coverage: a hash mismatch is changed since audit. Missing evidence stays unknown.</p>
    </section>
  );
}
