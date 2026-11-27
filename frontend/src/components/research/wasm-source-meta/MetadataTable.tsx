import type { ExtractedMetadata, EnvMetadata, SpecMetadata } from "@/server/research/wasm-source-meta/schema";

type MetadataTableProps = {
  metadata: ExtractedMetadata;
  envMeta: EnvMetadata;
  specMeta: SpecMetadata;
  wasmHash: string | null;
};

export function MetadataTable({ metadata, envMeta, specMeta, wasmHash }: MetadataTableProps) {
  const rows = [
    { label: "Wasm hash", value: wasmHash },
    { label: "Repository", value: metadata.repository },
    { label: "Commit", value: metadata.commit },
    { label: "SDK version", value: metadata.sdkVersion },
    { label: "Rust version", value: metadata.rustVersion },
    { label: "Build tool", value: metadata.buildTool },
    { label: "Interface version", value: envMeta.interfaceVersion },
    { label: "Spec entries", value: specMeta.entryCount === null ? null : String(specMeta.entryCount) },
    {
      label: "contractmetav0",
      value: metadata.sectionPresent ? "present" : "absent",
    },
    {
      label: "contractenvmetav0",
      value: envMeta.sectionPresent ? "present" : "absent",
    },
    {
      label: "contractspecv0",
      value: specMeta.sectionPresent ? "present" : "absent",
    },
  ];

  return (
    <section aria-label="Wasm metadata" className="overflow-x-auto rounded-2xl border border-white/10">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-subtle">
          <tr>
            <th className="px-4 py-3 font-medium">Field</th>
            <th className="px-4 py-3 font-medium">Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-white/5">
              <td className="px-4 py-2 text-muted">{row.label}</td>
              <td className="px-4 py-2 font-mono text-xs">{row.value ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
