"use client";

import { StatusBadge } from "@/components/a11y/StatusBadge";
import type { DeclarationStatus, TomlFetchOutcome } from "@/server/research/metadata-integrity/schema";

const DECLARATION_TONES: Record<DeclarationStatus, "success" | "warning" | "danger" | "neutral"> = {
  matched: "success",
  absent: "warning",
  conflicting: "danger",
  expired: "warning",
  unreachable: "neutral",
};

const DECLARATION_LABELS: Record<DeclarationStatus, string> = {
  matched: "Matched declaration",
  absent: "Absent declaration",
  conflicting: "Conflicting declaration",
  expired: "Expired / retired declaration",
  unreachable: "Unreachable declaration",
};

const FETCH_LABELS: Record<TomlFetchOutcome, string> = {
  ok: "Fetched",
  redirect_blocked: "Redirect blocked",
  tls_or_https_required: "HTTPS required",
  private_or_local_target: "Private target blocked",
  oversized: "Oversized response",
  timeout: "Timed out",
  malformed: "Malformed response",
  http_error: "HTTP error",
  dns_failure: "DNS failure",
  missing_home_domain: "No home domain",
};

export function DeclarationStatusPanel(props: {
  declarationStatus: DeclarationStatus;
  fetchOutcome: TomlFetchOutcome;
  identityKey: string;
  notes: string[];
  domainOwnershipClaimed: false;
  changeIsObservationNotFraud: true;
  legitimacyVerdict: null;
}) {
  return (
    <section aria-labelledby="declaration-heading" className="flex flex-col gap-3" data-testid="declaration-status">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="declaration-heading" className="text-lg font-semibold">
          Declaration status
        </h2>
        <StatusBadge tone={DECLARATION_TONES[props.declarationStatus]}>
          {DECLARATION_LABELS[props.declarationStatus]}
        </StatusBadge>
        <StatusBadge tone="neutral">{FETCH_LABELS[props.fetchOutcome]}</StatusBadge>
      </div>

      <p className="font-mono text-xs text-subtle" data-testid="identity-key">
        Identity: {props.identityKey}
      </p>

      <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
        {props.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>

      <aside
        className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-muted"
        data-testid="ownership-caveat"
      >
        <p>
          Domain ownership claimed from TOML: <strong>no</strong> ({String(props.domainOwnershipClaimed)}).
        </p>
        <p>
          Metadata change treated as fraud: <strong>no</strong> — changes are observations only (
          {String(props.changeIsObservationNotFraud)}).
        </p>
        <p>
          Legitimacy verdict: <strong>none</strong> ({String(props.legitimacyVerdict)}).
        </p>
      </aside>
    </section>
  );
}
