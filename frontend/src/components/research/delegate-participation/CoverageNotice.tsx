import type { DelegateParticipationReport } from "@/server/research/delegate-participation/schema";

/** What the answer rests on, and which proposals it could not decide. */
export function CoverageNotice({ report }: { report: DelegateParticipationReport }) {
  return (
    <aside className="space-y-3 rounded border p-4" aria-label="Evidence coverage">
      <h2 className="text-lg font-semibold">Evidence coverage</h2>
      <p className="text-sm">
        Blocks {report.range.fromBlock}–{report.range.toBlock}
        {report.range.coversHistory ? " (reaches the chain's start)" : " (does not reach the chain's start)"} ·{" "}
        {report.proposals.length} proposal(s) read
      </p>
      <ul className="list-inside list-disc text-sm">
        {report.coverage.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
      {report.proposals.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="pb-2 text-left">Proposals read, and whether their whole voting window was scanned</caption>
            <thead>
              <tr>
                {["Proposal", "Snapshot block", "Closes at block", "Window scanned"].map((label) => (
                  <th key={label} scope="col" className="p-2">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.proposals.map((proposal) => (
                <tr key={proposal.proposalId}>
                  <th scope="row" className="max-w-56 break-all p-2">
                    <a href={proposal.txUrl} target="_blank" rel="noreferrer noopener" className="underline">
                      {proposal.proposalId}
                    </a>
                  </th>
                  <td className="p-2 tabular-nums">{proposal.startBlock}</td>
                  <td className="p-2 tabular-nums">{proposal.endBlock}</td>
                  <td className="p-2">{proposal.fullyInRange ? "Fully" : "Partly"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </aside>
  );
}
