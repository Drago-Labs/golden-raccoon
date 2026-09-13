/**
 * Strips provider credentials and raw wallet payloads before anything reaches
 * the response.
 *
 * The rule is deny-by-default for the `raw` bag: no key from a provider payload
 * is ever forwarded. Only the fields this feature explicitly models — status,
 * timestamp, structured value, window — cross the boundary. That way a provider
 * adding a new field tomorrow cannot leak it through this endpoint.
 */
import type { ObservationInput } from "./schema";

/** Key fragments that mark a value as secret if one ever reaches presentation. */
const SECRET_KEY_FRAGMENTS = [
  "apikey",
  "api_key",
  "authorization",
  "bearer",
  "credential",
  "cookie",
  "mnemonic",
  "passphrase",
  "password",
  "privatekey",
  "private_key",
  "secret",
  "seed",
  "session",
  "signature",
  "token",
  "xdr",
];

export function isSecretKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z_]/g, "");
  return SECRET_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment.replace(/[^a-z_]/g, "")));
}

export type RedactionResult = {
  /** True when the observation carried a `raw` bag that was dropped. */
  redacted: boolean;
  /** Number of individual fields dropped, for the coverage count. */
  droppedFieldCount: number;
  /** Names of dropped keys that looked like secrets, for the audit note. */
  secretKeys: string[];
};

/**
 * Inspects an observation's raw payload and reports what was dropped. The
 * payload itself is never returned — this only describes the removal.
 */
export function redactObservation(observation: ObservationInput): RedactionResult {
  const raw = observation.raw;

  if (!raw) return { redacted: false, droppedFieldCount: 0, secretKeys: [] };

  const keys = Object.keys(raw);

  return {
    redacted: true,
    droppedFieldCount: keys.length,
    secretKeys: keys.filter(isSecretKey).sort(),
  };
}

export function redactionNote(result: RedactionResult): string {
  if (!result.redacted) return "";

  const secretPart =
    result.secretKeys.length > 0
      ? ` ${result.secretKeys.length} of them matched a credential or wallet-payload pattern (${result.secretKeys.join(", ")}).`
      : "";

  return `The provider payload was dropped before presentation: ${result.droppedFieldCount} field${result.droppedFieldCount === 1 ? "" : "s"} removed.${secretPart}`;
}
