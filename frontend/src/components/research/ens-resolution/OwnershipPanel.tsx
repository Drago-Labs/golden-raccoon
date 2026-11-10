import type { OwnershipEvidence } from "@/server/research/ens-resolution";

export function OwnershipPanel(props: { ownership: OwnershipEvidence }) {
  return (
    <div className="space-y-2 rounded-lg border border-white/10 p-4 text-xs">
      <h3 className="text-sm font-medium text-white">Registration & ownership</h3>
      <div>Registrant: {props.ownership.registrant ?? "n/a"}</div>
      <div>Controller: {props.ownership.controller ?? "n/a"}</div>
      <div>NameWrapper wrapped: {props.ownership.nameWrapperWrapped ? "Yes" : "No"}</div>
      <div>Expired: {props.ownership.expiredAtRecordedTime ? "Yes" : "No"}</div>
    </div>
  );
}
