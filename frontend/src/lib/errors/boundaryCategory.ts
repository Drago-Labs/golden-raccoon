/**
 * Typed categorisation of errors that reach a route boundary (issue #134).
 *
 * A boundary has to choose what to offer the user, and "something went wrong,
 * try again" is the wrong offer for most failures: retrying a provider outage
 * hammers a dead endpoint, and retrying a client bug repeats it. The category
 * here is derived from structured fields the error actually carries, never from
 * prose.
 *
 * What survives to a boundary is limited. A throw inside a Server Component is
 * stripped by Next.js in production: the message is replaced and only `digest`
 * remains. Categorisation therefore reads structured fields first and treats an
 * unrecognisable error as a client bug rather than guessing — the fail-closed
 * default, since a boundary must never imply the data behind it was fine.
 */

import type { StellarProviderErrorCode } from "@/server/stellar/dataLayer";

export type ErrorCategory =
  | "provider_outage"
  | "not_found"
  | "wallet"
  | "rate_limited"
  | "client_bug";

export type RecoveryKind = "retry" | "go_back" | "reconnect_wallet" | "contact_operations";

export type RecoveryAction = {
  kind: RecoveryKind;
  label: string;
};

export type BoundaryError = Error & {
  digest?: string;
  code?: unknown;
  errorCode?: unknown;
  status?: unknown;
};

/**
 * Every Stellar provider error code, mapped to what a user can do about it.
 *
 * Typed as a total `Record` on purpose: adding a code to
 * `StellarProviderErrorCode` without deciding its recovery action fails to
 * compile rather than silently falling through to "contact operations".
 */
const PROVIDER_CODE_CATEGORY: Record<StellarProviderErrorCode, ErrorCategory> = {
  all_providers_failed: "provider_outage",
  invalid_request: "client_bug",
  malformed_xdr: "client_bug",
  missing_entry: "not_found",
  network_mismatch: "wallet",
  provider_lag: "provider_outage",
  rpc_error: "provider_outage",
  simulation_failed: "client_bug",
  submission_failed: "provider_outage",
  timeout: "provider_outage",
  transport_error: "provider_outage",
};

const RECOVERY_BY_CATEGORY: Record<ErrorCategory, RecoveryAction> = {
  provider_outage: { kind: "retry", label: "Retry" },
  not_found: { kind: "go_back", label: "Go back" },
  wallet: { kind: "reconnect_wallet", label: "Reconnect wallet" },
  rate_limited: { kind: "retry", label: "Retry" },
  client_bug: { kind: "contact_operations", label: "Contact operations" },
};

const HEADLINE_BY_CATEGORY: Record<ErrorCategory, string> = {
  provider_outage: "A data provider is unavailable",
  not_found: "This resource does not exist",
  wallet: "Your wallet session is no longer valid",
  rate_limited: "Too many requests",
  client_bug: "Something went wrong in the app",
};

/**
 * Descriptions state what is *not* known, never that things are fine. A
 * boundary that reassures the user is worse than no boundary.
 */
const DESCRIPTION_BY_CATEGORY: Record<ErrorCategory, string> = {
  provider_outage:
    "We could not reach the network data provider, so nothing on this page is current. Retrying may succeed once the provider recovers.",
  not_found:
    "The item you asked for is not present. It may have been removed, or the link may be wrong.",
  wallet:
    "The connected wallet no longer matches this session — the account or network may have changed. Reconnect before acting on anything shown here.",
  rate_limited:
    "The request was rejected for exceeding a rate limit. No data was loaded. Wait a moment before retrying.",
  client_bug:
    "This page failed to render and no data was loaded. Retrying is unlikely to help; operations can investigate with the reference below.",
};

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function isProviderCode(value: string): value is StellarProviderErrorCode {
  return Object.hasOwn(PROVIDER_CODE_CATEGORY, value);
}

/**
 * Categorises by HTTP status when a fetch failure carried one through.
 */
function categoryFromStatus(status: number): ErrorCategory | undefined {
  if (status === 404) return "not_found";
  if (status === 401 || status === 403) return "wallet";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "provider_outage";
  return undefined;
}

/** Determines the category of an error that reached a boundary. */
export function categorizeBoundaryError(error: unknown): ErrorCategory {
  if (typeof error !== "object" || error === null) {
    return "client_bug";
  }

  const candidate = error as BoundaryError;

  const code = readString(candidate.code) ?? readString(candidate.errorCode);
  if (code && isProviderCode(code)) {
    return PROVIDER_CODE_CATEGORY[code];
  }

  if (typeof candidate.status === "number") {
    const fromStatus = categoryFromStatus(candidate.status);
    if (fromStatus) {
      return fromStatus;
    }
  }

  // Next.js signals a not-found through a marker on the thrown value rather
  // than through a code of its own.
  if (readString((candidate as { digest?: unknown }).digest) === "NEXT_NOT_FOUND") {
    return "not_found";
  }

  return "client_bug";
}

export function recoveryForCategory(category: ErrorCategory): RecoveryAction {
  return RECOVERY_BY_CATEGORY[category];
}

/**
 * Chooses the recovery action for a boundary, honouring whether retrying is
 * safe on that route.
 *
 * Some segments re-run irreversible or billable work when they render — a
 * transaction submission, a paid scan. Offering "Retry" there turns a failed
 * render into a second charge, so on those routes a retry is downgraded to
 * going back. The user can start the work again deliberately; the boundary
 * will not do it for them.
 */
export function resolveRecovery(category: ErrorCategory, retrySafe: boolean): RecoveryAction {
  const action = RECOVERY_BY_CATEGORY[category];

  if (action.kind === "retry" && !retrySafe) {
    return RECOVERY_BY_CATEGORY.not_found;
  }

  return action;
}

export function headlineForCategory(category: ErrorCategory): string {
  return HEADLINE_BY_CATEGORY[category];
}

export function descriptionForCategory(category: ErrorCategory): string {
  return DESCRIPTION_BY_CATEGORY[category];
}

/** The categories a boundary can produce, for tests and tooling. */
export const ERROR_CATEGORIES: readonly ErrorCategory[] = Object.keys(
  RECOVERY_BY_CATEGORY,
) as ErrorCategory[];
