import type { CompatibilityReport } from "@/server/research/wasm-source-meta/schema";

type CompatibilityPanelProps = {
  compatibility: CompatibilityReport;
};

export function CompatibilityPanel({ compatibility }: CompatibilityPanelProps) {
  const tone =
    compatibility.compatible === true
      ? "border-green-300/25 bg-green-400/8 text-green-100"
      : compatibility.compatible === false
        ? "border-yellow-300/25 bg-yellow-400/8 text-yellow-100"
        : "border-white/10 bg-white/4 text-muted";

  return (
    <section aria-label="Network compatibility" className={`rounded-2xl border p-4 text-sm ${tone}`}>
      <h2 className="mb-2 font-medium text-inherit">Network compatibility</h2>
      <dl className="grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide opacity-70">Network protocol</dt>
          <dd className="font-mono text-xs">{compatibility.networkProtocol}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide opacity-70">Wasm interface</dt>
          <dd className="font-mono text-xs">{compatibility.wasmInterfaceVersion ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide opacity-70">SDK version</dt>
          <dd className="font-mono text-xs">{compatibility.sdkVersion ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide opacity-70">Compatible</dt>
          <dd className="font-mono text-xs">
            {compatibility.compatible === null ? "unknown" : String(compatibility.compatible)}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-xs opacity-90">{compatibility.notes}</p>
    </section>
  );
}
