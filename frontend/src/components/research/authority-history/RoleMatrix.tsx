import type { ObservedOwner, RoleAdmin, RoleHolder } from "@/server/research/authority-history/schema";

function shortRole(roleId: string) {
  if (/^0x0+$/.test(roleId)) return "DEFAULT_ADMIN_ROLE";
  return `${roleId.slice(0, 10)}…${roleId.slice(-6)}`;
}

export function RoleMatrix({
  holders,
  admins,
  owners,
  reconstructionValid,
}: {
  holders: RoleHolder[];
  admins: RoleAdmin[];
  owners: ObservedOwner[];
  reconstructionValid: boolean;
}) {
  return (
    <section
      data-testid="authority-role-matrix"
      aria-labelledby="authority-role-matrix-heading"
      className="glass-panel rounded-2xl border border-white/10 p-5"
    >
      <h2 id="authority-role-matrix-heading" className="text-lg font-semibold">
        Role matrix
      </h2>
      {!reconstructionValid ? (
        <p className="mt-3 text-sm text-[#f2c86d]">
          Reconstructed holders are withheld because the indexed range is incomplete, reorged, or missing block hashes.
          Event evidence in the timeline remains available.
        </p>
      ) : (
        <p className="mt-1 text-sm text-white/50">
          Derived only from a complete indexed range. Proxy administration stays separate from application roles.
        </p>
      )}

      <div className="mt-4 space-y-5">
        <div>
          <h3 className="text-sm font-medium text-white/70">Observed owners</h3>
          {owners.length === 0 ? (
            <p className="mt-2 text-xs text-white/45">No owner reconstructed inside this range.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-xs">
              {owners.map((owner) => (
                <li
                  key={`${owner.family}:${owner.address ?? "none"}`}
                  className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 font-mono"
                >
                  <span className="text-white/45">{owner.family === "proxy_admin" ? "proxy admin" : "application owner"} · </span>
                  {owner.address ?? "unknown"}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="text-sm font-medium text-white/70">Role holders</h3>
          {holders.length === 0 ? (
            <p className="mt-2 text-xs text-white/45">No AccessControl holders reconstructed inside this range.</p>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left text-xs">
                <thead className="text-white/45">
                  <tr>
                    <th className="pb-2 pr-3 font-medium">Family</th>
                    <th className="pb-2 pr-3 font-medium">Role</th>
                    <th className="pb-2 font-medium">Account</th>
                  </tr>
                </thead>
                <tbody>
                  {holders.map((holder) => (
                    <tr key={`${holder.family}:${holder.roleId}:${holder.account}`} className="border-t border-white/8">
                      <td className="py-2 pr-3">{holder.family === "proxy_admin" ? "proxy admin" : "application"}</td>
                      <td className="py-2 pr-3 font-mono" title={holder.roleId}>
                        {shortRole(holder.roleId)}
                      </td>
                      <td className="py-2 font-mono">{holder.account}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <h3 className="text-sm font-medium text-white/70">Role admins</h3>
          {admins.length === 0 ? (
            <p className="mt-2 text-xs text-white/45">No RoleAdminChanged events reconstructed inside this range.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-xs font-mono">
              {admins.map((admin) => (
                <li key={`${admin.family}:${admin.roleId}`} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  {shortRole(admin.roleId)} ← admin {shortRole(admin.adminRoleId)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
