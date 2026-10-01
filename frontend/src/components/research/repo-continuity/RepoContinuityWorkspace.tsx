"use client";

export function RepoContinuityWorkspace() {
  return (
    <section aria-labelledby="repo-summary">
      <h2 id="repo-summary">Activity summary</h2>
      <label htmlFor="repo-name">Repository</label>
      <input id="repo-name" name="repo" />
      <button type="button">Measure</button>
      <p>Coverage: a rate limit is unavailable, not zero commits. Tokens stay on the server.</p>
    </section>
  );
}
