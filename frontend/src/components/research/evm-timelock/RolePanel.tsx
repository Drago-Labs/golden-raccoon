import type { TimelockRoleSummary } from "@/server/research/evm-timelock";

export function RolePanel(props: { roles: TimelockRoleSummary }) {
  return (
    <div className="space-y-2 rounded-lg border border-white/10 p-4 text-xs">
      <h3 className="text-sm font-medium text-white">Role holders</h3>
      <div>Open executor: {props.roles.openExecutor ? "Yes" : "No"}</div>
      <div>Proposers: {props.roles.proposers.map((p) => p.address).join(", ") || "None"}</div>
      <div>Executors: {props.roles.executors.map((e) => e.address).join(", ") || "None"}</div>
      <div>EOA admins: {props.roles.eoaAdmins.join(", ") || "None"}</div>
    </div>
  );
}
