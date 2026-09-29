import type { AuthorityEvent } from "@/server/research/authority-history/schema";

function summarize(event: AuthorityEvent): string {
  switch (event.kind) {
    case "OwnershipTransferred":
      return `${event.previousOwner} → ${event.newOwner}`;
    case "RoleGranted":
      return `grant ${event.roleId} to ${event.account}`;
    case "RoleRevoked":
      return `revoke ${event.roleId} from ${event.account}`;
    case "RoleAdminChanged":
      return `admin(${event.roleId}) ${event.previousAdminRole} → ${event.newAdminRole}`;
    case "AdminChanged":
      return `proxy admin ${event.previousAdmin} → ${event.newAdmin}`;
    default:
      return event.kind;
  }
}

export function AuthorityTimeline({
  events,
  selectedIndex,
  onSelect,
}: {
  events: AuthorityEvent[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
}) {
  return (
    <section
      data-testid="authority-timeline"
      aria-labelledby="authority-timeline-heading"
      className="glass-panel rounded-2xl border border-white/10 p-5"
    >
      <h2 id="authority-timeline-heading" className="text-lg font-semibold">
        Authority timeline
      </h2>
      <p className="mt-1 text-sm text-white/50">
        Oldest first. Open an event for block hash and transaction evidence.
      </p>
      {events.length === 0 ? (
        <p className="mt-4 text-sm text-white/54">No standard authority events in this range.</p>
      ) : (
        <ol className="mt-4 space-y-2">
          {events.map((event, index) => {
            const selected = selectedIndex === index;
            return (
              <li key={`${event.transactionHash}:${event.logIndex}`}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelect(index)}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition focus-visible:outline-2 focus-visible:outline-[#d9a441] ${
                    selected
                      ? "border-[#d9a441]/60 bg-[#d9a441]/10"
                      : "border-white/10 bg-black/20 hover:border-white/25"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs text-white/45">
                    <span className="font-mono">#{event.blockNumber}</span>
                    <span>{event.kind}</span>
                    <span className="rounded-full border border-white/15 px-2 py-0.5">
                      {event.family === "proxy_admin" ? "proxy admin" : "application"}
                    </span>
                  </div>
                  <p className="mt-1 break-all font-mono text-xs text-white/75">{summarize(event)}</p>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
