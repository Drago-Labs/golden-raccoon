export function CoverageNotice({ notice, state }: { notice: string; state: string }) {
  return (
    <section data-testid="coverage-notice" className="rounded-2xl border border-white/10 bg-white/4 p-4 text-sm">
      <h2 className="text-lg font-semibold">Coverage</h2>
      <p>State: {state}. {notice}</p>
    </section>
  );
}
