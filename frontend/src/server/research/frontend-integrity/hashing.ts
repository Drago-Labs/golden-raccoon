import { createHash } from "node:crypto";

/** sha256 of the recorded bytes. External scripts are hashed as their URL, not downloaded. */
export function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
