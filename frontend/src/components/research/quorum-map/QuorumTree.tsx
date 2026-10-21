import type { QuorumSetNode } from "@/server/research/quorum-map/schema";

function Tree({ set }: { set: QuorumSetNode }) {
  return (
    <li>
      Threshold {set.threshold}
      <ul className="ml-4 list-disc">
        {set.validators.map((key) => <li key={key} className="font-mono text-xs">{key}</li>)}
        {set.innerSets.map((inner, index) => <Tree key={`${inner.threshold}-${index}`} set={inner} />)}
      </ul>
    </li>
  );
}

export function QuorumTree({ sets, unresolvedKeys }: { sets: Array<{ owner: string; set: QuorumSetNode }>; unresolvedKeys: string[] }) {
  return (
    <section data-testid="quorum-tree" className="rounded-2xl border border-white/10 bg-white/4 p-4 text-sm">
      <h2 className="text-lg font-semibold">Quorum sets</h2>
      <ul className="mt-3 flex flex-col gap-3">
        {sets.map((entry) => (
          <li key={entry.owner}>
            <p className="font-mono text-xs">{entry.owner}</p>
            <ul><Tree set={entry.set} /></ul>
          </li>
        ))}
      </ul>
      {unresolvedKeys.length > 0 ? <p data-testid="unresolved-keys">Unresolved keys: {unresolvedKeys.join(", ")}</p> : null}
    </section>
  );
}
