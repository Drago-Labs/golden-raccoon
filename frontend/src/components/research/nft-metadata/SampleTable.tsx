import type { TokenSample } from "@/server/research/nft-metadata";

export function SampleTable(props: { samples: TokenSample[] }) {
  const { samples } = props;

  if (samples.length === 0) {
    return <p className="text-xs text-white/55">No tokens were sampled — the standard could not be detected.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-xs">
        <thead>
          <tr className="border-b border-white/10 text-white/50">
            <th scope="col" className="py-2 pr-3">
              Token ID
            </th>
            <th scope="col" className="py-2 pr-3">
              URI hosting
            </th>
            <th scope="col" className="py-2 pr-3">
              Pinned
            </th>
            <th scope="col" className="py-2 pr-3">
              Resolved
            </th>
            <th scope="col" className="py-2 pr-3">
              Media
            </th>
          </tr>
        </thead>
        <tbody>
          {samples.map((sample) => (
            <tr key={sample.tokenId} className="border-b border-white/5">
              <td className="py-2 pr-3 font-mono">{sample.tokenId}</td>
              <td className="py-2 pr-3">{sample.resolution.hosting?.kind ?? "none"}</td>
              <td className="py-2 pr-3">{sample.resolution.hosting?.pinned ? "Yes" : "No"}</td>
              <td className="py-2 pr-3">
                {sample.uri === null ? (
                  <span className="text-white/40">no URI returned</span>
                ) : sample.resolution.resolved ? (
                  "Yes"
                ) : (
                  <span className="text-amber-300">No — {sample.resolution.reason}</span>
                )}
              </td>
              <td className="py-2 pr-3">
                {!sample.resolution.media
                  ? "—"
                  : sample.resolution.media.resolved
                    ? "Resolved"
                    : `Failed — ${sample.resolution.media.reason}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
