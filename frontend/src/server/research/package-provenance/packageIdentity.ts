/**
 * Parses and validates a caller-supplied registry + package name pair.
 *
 * This is deliberately strict: only names that are shaped like real npm or
 * crates.io package identifiers are accepted, so the rest of this feature
 * only ever builds registry URLs out of a validated name, never a raw
 * caller string.
 */
import type { PackageRegistryName } from "./schema";

export type PackageIdentity = {
  registry: PackageRegistryName;
  name: string;
};

const NPM_NAME_RE = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const CRATES_NAME_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function parsePackageIdentity(registry: unknown, rawName: unknown): PackageIdentity | null {
  if (registry !== "npm" && registry !== "crates") {
    return null;
  }
  if (typeof rawName !== "string") {
    return null;
  }

  const name = rawName.trim();
  if (!name || name.length > 214) {
    return null;
  }

  if (registry === "npm" && !NPM_NAME_RE.test(name)) {
    return null;
  }
  if (registry === "crates" && !CRATES_NAME_RE.test(name)) {
    return null;
  }

  return { registry, name };
}

/** npm's registry API expects the `/` in a scoped name escaped as `%2f`. */
export function npmEncodedName(name: string): string {
  return name.startsWith("@") ? `${encodeURIComponent(name.slice(0, name.indexOf("/")))}%2f${name.slice(name.indexOf("/") + 1)}` : encodeURIComponent(name);
}
