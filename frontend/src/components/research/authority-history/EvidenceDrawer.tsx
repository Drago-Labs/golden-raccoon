"use client";

import { useEffect, useRef } from "react";
import type { AuthorityEvent } from "@/server/research/authority-history/schema";

/**
 * Non-modal complementary evidence region.
 *
 * Focus moves to the heading when an event is selected so keyboard users land
 * on the detail they asked for. Escape closes and returns focus to the timeline.
 */
export function EvidenceDrawer({
  event,
  onClose,
}: {
  event: AuthorityEvent | null;
  onClose: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (event) headingRef.current?.focus();
  }, [event]);

  if (!event) {
    return (
      <aside
        aria-label="Evidence detail"
        data-testid="authority-evidence-empty"
        className="rounded-xl border border-dashed border-white/15 p-4 text-sm text-white/45"
      >
        Select a timeline event to inspect block hash and transaction evidence.
      </aside>
    );
  }

  return (
    <aside
      aria-label="Evidence detail"
      data-testid="authority-evidence-drawer"
      className="rounded-xl border border-white/10 bg-black/20 p-4"
      onKeyDown={(eventKey) => {
        if (eventKey.key === "Escape") onClose();
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 ref={headingRef} tabIndex={-1} className="text-sm font-semibold outline-none">
          {event.kind}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-white/15 px-2 py-1 text-xs text-white/55 hover:text-white focus-visible:outline-2 focus-visible:outline-[#d9a441]"
        >
          Close
        </button>
      </div>

      <dl className="mt-3 space-y-2 text-xs">
        <div>
          <dt className="text-white/40">Family</dt>
          <dd>{event.family === "proxy_admin" ? "proxy administration" : "application"}</dd>
        </div>
        <div>
          <dt className="text-white/40">Network</dt>
          <dd className="font-mono">{event.network}</dd>
        </div>
        <div>
          <dt className="text-white/40">Contract</dt>
          <dd className="break-all font-mono">{event.contractAddress}</dd>
        </div>
        <div>
          <dt className="text-white/40">Block</dt>
          <dd className="font-mono">{event.blockNumber}</dd>
        </div>
        <div>
          <dt className="text-white/40">Block hash</dt>
          <dd className="break-all font-mono">{event.blockHash}</dd>
        </div>
        <div>
          <dt className="text-white/40">Transaction</dt>
          <dd className="break-all font-mono">
            {event.transactionUrl ? (
              <a
                href={event.transactionUrl}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 hover:text-[#f2c86d]"
              >
                {event.transactionHash}
              </a>
            ) : (
              event.transactionHash
            )}
          </dd>
        </div>
        {event.roleId ? (
          <div>
            <dt className="text-white/40">Role id</dt>
            <dd className="break-all font-mono">{event.roleId}</dd>
          </div>
        ) : null}
        {event.account ? (
          <div>
            <dt className="text-white/40">Account</dt>
            <dd className="break-all font-mono">{event.account}</dd>
          </div>
        ) : null}
        {event.newOwner ? (
          <div>
            <dt className="text-white/40">New owner</dt>
            <dd className="break-all font-mono">{event.newOwner}</dd>
          </div>
        ) : null}
        {event.newAdmin ? (
          <div>
            <dt className="text-white/40">New proxy admin</dt>
            <dd className="break-all font-mono">{event.newAdmin}</dd>
          </div>
        ) : null}
      </dl>
    </aside>
  );
}
