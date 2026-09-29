import type { InputDifference } from "@/server/research/run-comparison/schema";

const KIND_LABELS: Record<InputDifference["kind"], string> = {
  added: "Added",
  removed: "Removed",
  changed: "Changed",
};

/**
 * What the two runs were given.
 *
 * Shown before the agent differences, because a changed input is the most
 * ordinary explanation for a changed output — and the one the record actually
 * supports, unlike a guessed cause.
 */
export function InputChangesPanel({ differences }: { differences: InputDifference[] }) {
  if (differences.length === 0) {
    return (
      <p data-testid="input-changes-empty" className="text-sm text-white/54">
        Both runs were given the same inputs, so far as the stored snapshots record.
      </p>
    );
  }

  return (
    <div data-testid="input-changes" className="overflow-x-auto">
      <table className="w-full min-w-[30rem] border-collapse text-left text-sm">
        <caption className="sr-only">Differences between the inputs recorded for each run</caption>
        <thead>
          <tr className="text-xs uppercase tracking-[0.12em] text-white/42">
            <th scope="col" className="py-2 pr-4 font-medium">
              Field
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              First run
            </th>
            <th scope="col" className="py-2 font-medium">
              Second run
            </th>
          </tr>
        </thead>
        <tbody>
          {differences.map((difference) => (
            <tr key={difference.path} className="border-t border-white/8 align-top">
              <td className="py-3 pr-4">
                <span className="break-all font-mono text-xs text-white/78">{difference.path}</span>
                <span className="mt-0.5 block text-xs text-white/42">{KIND_LABELS[difference.kind]}</span>
              </td>
              <td className="py-3 pr-4 break-all font-mono text-xs text-white/70">{difference.before ?? "—"}</td>
              <td className="py-3 break-all font-mono text-xs text-white/70">{difference.after ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
