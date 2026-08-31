/**
 * Redaction shared by the browser and the server (issue #134).
 *
 * This lives in `lib` rather than `server/observability` because the browser
 * has to apply it *before* the report is sent. Redacting only on arrival still
 * puts an address on the wire and in every proxy log between the two, so the
 * page must not emit one in the first place.
 *
 * Deliberately dependency-free: it is bundled into the client, and a boundary
 * is the one place that must not fail while handling a failure.
 */

/** Longest string kept in any field; anything longer is truncated. */
export const MAX_REPORT_FIELD_LENGTH = 200;

const STELLAR_SECRET = /\bS[A-Z2-7]{55}\b/g;
const EVM_ADDRESS = /\b0x[a-fA-F0-9]{40}\b/g;
/** Stellar account (G), muxed account (M), and contract (C) identifiers. */
const STELLAR_IDENTIFIER = /\b[GMC][A-Z2-7]{55}\b/g;
const LONG_HEX = /\b[a-fA-F0-9]{64,}\b/g;
const DECIMAL_AMOUNT = /\b\d+\.\d+\b/g;
const BEARER_TOKEN = /\b(bearer\s+)\S+/gi;

/**
 * Removes anything identifying a holder or their holdings.
 *
 * Addresses and secrets are replaced outright rather than shortened: a
 * truncated address still narrows a user down, and a crash report has no use
 * for one. Decimal amounts go too — dropping a harmless one costs nothing,
 * while keeping a balance costs a great deal.
 */
export function redactReportText(input: string): string {
  let result = input.replace(STELLAR_SECRET, "[SECRET]");
  result = result.replace(BEARER_TOKEN, "$1[REDACTED]");
  result = result.replace(EVM_ADDRESS, "[ADDRESS]");
  result = result.replace(STELLAR_IDENTIFIER, "[ADDRESS]");
  result = result.replace(LONG_HEX, "[HASH]");
  result = result.replace(DECIMAL_AMOUNT, "[AMOUNT]");

  return result.length > MAX_REPORT_FIELD_LENGTH
    ? `${result.slice(0, MAX_REPORT_FIELD_LENGTH)}…`
    : result;
}
