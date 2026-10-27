import { registrableDomain } from "./urlNormalize";
export function normalizeOfficialDomains(domains: string[]): string[] { return [...new Set(domains.map((domain) => { const value = domain.includes("://") ? new URL(domain).hostname : domain; return registrableDomain(value.toLowerCase()); }))].sort(); }
export function isOfficialDomain(hostname: string, officials: string[]): boolean { return officials.some((official) => hostname === official || hostname.endsWith(`.${official}`)); }
