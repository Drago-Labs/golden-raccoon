import type { RoleHolder, TimelockRoleSummary } from "./schema";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function summarizeTimelockRoles(roles: {
  proposers: RoleHolder[];
  executors: RoleHolder[];
  cancellers: RoleHolder[];
  admins: RoleHolder[];
}): TimelockRoleSummary {
  const openExecutor = roles.executors.some(
    (h) => h.address.toLowerCase() === ZERO_ADDRESS,
  );
  const eoaAdmins = roles.admins
    .filter((h) => !h.isContract && h.address.toLowerCase() !== ZERO_ADDRESS)
    .map((h) => h.address);

  return {
    ...roles,
    openExecutor,
    eoaAdmins,
  };
}
