import type { EventShapeFinding, SampledEvent } from "@/server/research/sep41-conformance";

export function EventSampleTable(props: {
  samples: SampledEvent[];
  shapes: EventShapeFinding[];
}) {
  const shapeBySample = new Map(
    props.shapes.filter((shape) => shape.sampleId).map((shape) => [shape.sampleId as string, shape]),
  );

  if (props.samples.length === 0) {
    return <p className="text-sm text-white/55">No recent token events were sampled.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm" aria-label="SEP-41 event samples">
        <thead className="text-xs uppercase tracking-wide text-white/45">
          <tr>
            <th className="px-3 py-2 font-medium">Ledger</th>
            <th className="px-3 py-2 font-medium">Event</th>
            <th className="px-3 py-2 font-medium">Topics</th>
            <th className="px-3 py-2 font-medium">Data</th>
            <th className="px-3 py-2 font-medium">Shape</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {props.samples.map((sample) => {
            const shape = shapeBySample.get(sample.id);
            return (
              <tr key={sample.id}>
                <td className="px-3 py-2 font-mono text-xs">{sample.ledger || "—"}</td>
                <td className="px-3 py-2 font-mono text-xs">{sample.topicName}</td>
                <td className="px-3 py-2 font-mono text-xs">{sample.topics.join(", ")}</td>
                <td className="px-3 py-2 text-xs text-white/70">
                  {sample.dataKind}
                  {sample.dataKeys.length > 0 ? ` (${sample.dataKeys.join(", ")})` : ""}
                </td>
                <td className="px-3 py-2 text-xs">
                  {shape
                    ? shape.ok
                      ? "ok"
                      : `mismatch: ${shape.mismatchedField ?? "unknown"}`
                    : "unchecked"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
