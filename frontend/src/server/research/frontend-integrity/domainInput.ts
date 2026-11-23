import { FrontendIntegrityError } from "./errors";

/** A domain is a hostname, not an arbitrary URL a caller could point at a private host. */
export function parseDomain(value: unknown): string {
  if (typeof value !== "string") {
    throw new FrontendIntegrityError("invalid_domain", "Domain must be a hostname.");
  }
  const domain = value.trim().toLowerCase().replace(/\.$/, "");
  if (!/^[a-z0-9.-]+$/.test(domain) || domain.includes("..") || domain.startsWith(".") || domain.endsWith(".")) {
    throw new FrontendIntegrityError("invalid_domain", "Domain must be a hostname.");
  }
  return domain;
}
