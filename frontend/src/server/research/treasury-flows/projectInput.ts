import { TreasuryError } from "./errors";
export function parseProjectId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-z0-9-]{2,40}$/.test(value)) {
    throw new TreasuryError("invalid_project", "Project id must be a short slug.");
  }
  return value;
}
