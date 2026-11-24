import type { ConformanceFinding } from "@/server/research/sep41-conformance";

export function FindingSummary(props: { findings: ConformanceFinding[] }) {
  if (props.findings.length === 0) {
    return (
      <p className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3 text-sm text-emerald-100">
        No deviations from the SEP-41 reference were found in the sampled surface.
      </p>
    );
  }

  return (
    <ul className="space-y-2" aria-label="SEP-41 findings">
      {props.findings.map((finding) => (
        <li
          key={finding.findingId}
          className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-sm text-amber-100"
        >
          <span className="font-medium capitalize">{finding.kind}</span>
          <span className="text-white/40"> · </span>
          <span className="font-mono text-xs">{finding.subject}</span>
          <p className="mt-1 text-amber-50/90">{finding.detail}</p>
        </li>
      ))}
    </ul>
  );
}
