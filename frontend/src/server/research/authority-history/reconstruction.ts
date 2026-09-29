import type {
  AuthorityEvent,
  ObservedOwner,
  RoleAdmin,
  RoleHolder,
} from "./schema";

/**
 * Reconstruct observed owners, role holders and role admins from a complete
 * chronological event list.
 *
 * Callers must only pass events when `reconstructionValid` is true. Passing
 * an incomplete range here would invent a false matrix — the service refuses
 * that path and returns empty reconstructed collections instead.
 */
export function reconstructAuthorityState(events: AuthorityEvent[]): {
  roleMatrix: RoleHolder[];
  roleAdmins: RoleAdmin[];
  observedOwners: ObservedOwner[];
} {
  const holders = new Map<string, RoleHolder>();
  const admins = new Map<string, RoleAdmin>();
  let applicationOwner: ObservedOwner = {
    address: null,
    family: "application",
    reconstructed: true,
    evidenceEventIndex: null,
  };
  let proxyAdmin: ObservedOwner = {
    address: null,
    family: "proxy_admin",
    reconstructed: true,
    evidenceEventIndex: null,
  };

  events.forEach((event, index) => {
    if (event.kind === "OwnershipTransferred" && event.newOwner) {
      applicationOwner = {
        address: event.newOwner,
        family: "application",
        reconstructed: true,
        evidenceEventIndex: index,
      };
      return;
    }

    if (event.kind === "AdminChanged" && event.newAdmin) {
      proxyAdmin = {
        address: event.newAdmin,
        family: "proxy_admin",
        reconstructed: true,
        evidenceEventIndex: index,
      };
      return;
    }

    if (event.kind === "RoleGranted" && event.roleId && event.account) {
      const key = `${event.family}:${event.roleId}:${event.account}`;
      holders.set(key, {
        roleId: event.roleId,
        account: event.account,
        family: event.family,
        reconstructed: true,
      });
      return;
    }

    if (event.kind === "RoleRevoked" && event.roleId && event.account) {
      holders.delete(`${event.family}:${event.roleId}:${event.account}`);
      return;
    }

    if (event.kind === "RoleAdminChanged" && event.roleId && event.newAdminRole) {
      admins.set(`${event.family}:${event.roleId}`, {
        roleId: event.roleId,
        adminRoleId: event.newAdminRole,
        family: event.family,
        reconstructed: true,
      });
    }
  });

  const observedOwners: ObservedOwner[] = [];
  if (applicationOwner.evidenceEventIndex !== null || applicationOwner.address) {
    observedOwners.push(applicationOwner);
  }
  if (proxyAdmin.evidenceEventIndex !== null || proxyAdmin.address) {
    observedOwners.push(proxyAdmin);
  }

  return {
    roleMatrix: [...holders.values()].sort((a, b) =>
      a.roleId === b.roleId ? a.account.localeCompare(b.account) : a.roleId.localeCompare(b.roleId),
    ),
    roleAdmins: [...admins.values()].sort((a, b) => a.roleId.localeCompare(b.roleId)),
    observedOwners,
  };
}

/**
 * Partition events so proxy administration never mixes into application roles.
 */
export function separateAuthorityFamilies(events: AuthorityEvent[]): {
  application: AuthorityEvent[];
  proxyAdmin: AuthorityEvent[];
} {
  return {
    application: events.filter((event) => event.family === "application"),
    proxyAdmin: events.filter((event) => event.family === "proxy_admin"),
  };
}
