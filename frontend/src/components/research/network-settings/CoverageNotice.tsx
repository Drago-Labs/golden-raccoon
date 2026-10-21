import type { CoverageReport } from "@/server/research/network-settings/schema";

export function CoverageNotice(props: { coverage: CoverageReport | null }) {
  const message = props.coverage?.message ?? "Settings have not been loaded.";

  return (
    <section aria-labelledby="coverage-heading" className="min-w-0 rounded-2xl border border-foreground/15 px-3 py-3">
      <h2 id="coverage-heading" className="text-lg font-semibold">
        Coverage
      </h2>
      <p role="status" className="mt-1 text-sm text-foreground/80">
        {message}
      </p>
    </section>
  );
}
