import { EnsResolutionError } from "./errors";

const DISALLOWED_CHARS = /[\u0000-\u002c\u002f\u003a-\u0040\u005b-\u0060\u007b-\u007f\s]/;

export function normalizeEnsName(rawName: string): string {
  const trimmed = rawName.trim().normalize("NFC").toLowerCase();
  if (!trimmed.includes(".") || trimmed.startsWith(".") || trimmed.endsWith(".")) {
    throw new EnsResolutionError(`Invalid ENS name: ${rawName}`, "invalid_ens_name", false);
  }
  const labels = trimmed.split(".");
  for (const label of labels) {
    if (!label || DISALLOWED_CHARS.test(label)) {
      throw new EnsResolutionError(`Disallowed label in ENS name: ${rawName}`, "invalid_ens_name", false);
    }
  }
  return labels.join(".");
}
