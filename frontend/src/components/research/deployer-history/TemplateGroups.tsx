import type { FlaggedMatch, TemplateGroup } from "@/server/research/deployer-history";

export function TemplateGroups(props: { groups: TemplateGroup[]; flaggedMatches: FlaggedMatch[] }) {
  const flaggedByAddress = new Map(props.flaggedMatches.map((match) => [match.address.toLowerCase(), match]));

  if (props.groups.length === 0) {
    return <p className="text-xs text-white/55">No repeated contract template was found among the scanned deployments.</p>;
  }

  return (
    <ul className="space-y-3">
      {props.groups.map((group) => (
        <li key={group.codeHash} className="rounded-lg border border-white/10 p-3 text-xs">
          <p className="font-mono text-white/70">{group.codeHash}</p>
          <p className="mt-1 text-white/50">{group.deployments.length} deployments share this exact runtime code</p>
          <ul className="mt-2 space-y-1">
            {group.deployments.map((address) => {
              const flagged = flaggedByAddress.get(address.toLowerCase());
              return (
                <li key={address} className="flex items-center gap-2 font-mono">
                  <span>{address}</span>
                  {flagged && (
                    <span className="rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[10px] text-red-200">
                      Flagged: {flagged.label} (source: {flagged.source})
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}
