import type { ProxyInspectionReport } from "@/server/research/proxy-inspector/schema";

/**
 * The raw evidence table.
 *
 * The graph above is an interpretation; this is what was actually read. It is
 * deliberately verbose — full slot keys, full words — because its job is to let
 * a reader re-run the same reads and disagree with the conclusion.
 */
export function ProxyEvidence({ report }: { report: ProxyInspectionReport }) {
  return (
    <div data-testid="proxy-evidence" className="flex flex-col gap-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
          <caption className="sr-only">Standardized storage slots read at the checked block</caption>
          <thead>
            <tr className="text-xs uppercase tracking-[0.12em] text-white/42">
              <th scope="col" className="py-2 pr-4 font-medium">
                Slot
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Raw word
              </th>
              <th scope="col" className="py-2 font-medium">
                Reading
              </th>
            </tr>
          </thead>
          <tbody>
            {report.slots.map((slot) => (
              <tr key={slot.slotKey} className="border-t border-white/8 align-top">
                <td className="py-3 pr-4">
                  <span className="text-white/78">{slot.label}</span>
                  <span className="mt-1 block break-all font-mono text-[11px] text-white/35">{slot.slot}</span>
                </td>
                <td className="py-3 pr-4 break-all font-mono text-xs text-white/70">{slot.rawValue ?? "—"}</td>
                <td className="py-3 text-xs leading-5 text-white/54">
                  {slot.unavailableReason
                    ? `Unavailable: ${slot.unavailableReason}`
                    : slot.isDirty
                      ? "Not address-shaped; no address is decoded from it."
                      : slot.isZero
                        ? "Zero. The slot exists and holds nothing."
                        : `Decoded ${slot.decodedAddress}`}
                </td>
              </tr>
            ))}
            {report.slots.length === 0 ? (
              <tr className="border-t border-white/8">
                <td colSpan={3} className="py-3 text-xs text-white/54">
                  No slot was read, because the target holds no code at the checked block.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <dl className="grid grid-cols-1 gap-3 text-xs text-white/54 sm:grid-cols-3">
        <div>
          <dt className="text-white/42">Checked at block</dt>
          <dd className="mt-1 font-mono text-white/78">
            {report.checkedAtBlockNumber === null ? report.checkedAtBlock : report.checkedAtBlockNumber.toLocaleString()}
          </dd>
        </div>
        <div>
          <dt className="text-white/42">Reads issued</dt>
          <dd className="mt-1 text-white/78">
            {report.coverage.rpcCallsUsed} of {report.coverage.rpcCallBudget} permitted
          </dd>
        </div>
        <div>
          <dt className="text-white/42">Target code</dt>
          <dd className="mt-1 text-white/78">
            {report.targetCode.unavailableReason
              ? "Unreadable"
              : report.targetCode.hasCode
                ? `${report.targetCode.codeSizeBytes?.toLocaleString() ?? "?"} bytes`
                : "No code"}
          </dd>
        </div>
      </dl>
    </div>
  );
}
