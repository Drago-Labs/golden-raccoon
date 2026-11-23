import type { SecurityHeaders } from "./schema";

export function readSecurityHeaders(headers: Record<string, string>): SecurityHeaders {
  return {
    csp: headers["content-security-policy"] ?? null,
    hsts: headers["strict-transport-security"] ?? null,
    frame: headers["x-frame-options"] ?? null,
    referrer: headers["referrer-policy"] ?? null,
  };
}
