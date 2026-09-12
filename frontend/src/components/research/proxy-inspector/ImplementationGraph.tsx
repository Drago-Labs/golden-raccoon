import type { ImplementationHop } from "@/server/research/proxy-inspector/schema";

const KIND_LABELS: Record<ImplementationHop["kind"], string> = {
  erc1967_direct: "ERC-1967 slot",
  legacy_slot: "Legacy slot",
  beacon: "Beacon",
  truncated: "Depth bound reached",
  cycle: "Cycle",
  unresolved: "Unresolved",
};

/**
 * The indirection path, drawn as an ordered list rather than a picture.
 *
 * A list is the accessible form of this graph: it reflows on a narrow screen,
 * it is readable in order by a screen reader, and each step carries the
 * observation that produced it instead of relying on an arrow to imply it.
 */
export function ImplementationGraph({ path }: { path: ImplementationHop[] }) {
  if (path.length === 0) {
    return (
      <p data-testid="implementation-graph-empty" className="text-sm text-white/54">
        No implementation indirection was observed, so there is no path to draw.
      </p>
    );
  }

  return (
    <ol data-testid="implementation-graph" className="flex flex-col gap-3">
      {path.map((hop) => (
        <li key={`${hop.depth}-${hop.kind}`} className="rounded-2xl border border-white/10 bg-white/4 p-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-white/54">
            <span className="rounded-full border border-white/12 px-2 py-0.5">Hop {hop.depth}</span>
            <span>{KIND_LABELS[hop.kind]}</span>
          </div>
          <p className="mt-2 break-all font-mono text-sm text-white/80">
            {hop.from.address}
            <span aria-hidden="true"> → </span>
            <span className="sr-only"> points to </span>
            {hop.to ? hop.to.address : "not resolved"}
          </p>
          {hop.to ? (
            <p className="mt-1 text-xs text-white/42">
              on {hop.to.network}
              {hop.to.chainId === null ? "" : ` (chain ${hop.to.chainId})`}
              {hop.code ? (hop.code.hasCode ? " · holds code" : " · holds no code") : ""}
            </p>
          ) : null}
          <p className="mt-2 text-xs leading-5 text-white/54">{hop.evidence}</p>
        </li>
      ))}
    </ol>
  );
}
