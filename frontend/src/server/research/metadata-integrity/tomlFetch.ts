/**
 * Bounded, fail-closed SEP-1 stellar.toml fetch with explicit outcomes.
 *
 * Redirects are followed manually so each hop is re-checked for HTTPS, private
 * hosts, and size. Nothing here claims the domain is owned by the issuer.
 */
import { lookup } from "node:dns/promises";
import { assertSep1FetchAllowed, isPrivateOrLocalHost } from "@/server/security/urlSafety";
import { METADATA_LIMITS, type TomlFetchResult, type TomlFetcher } from "./schema";

async function assertResolvedHostIsPublic(url: string): Promise<string[]> {
  const hostname = new URL(url).hostname;

  if (isPrivateOrLocalHost(hostname)) {
    return ["private or localhost target blocked"];
  }

  try {
    const records = await lookup(hostname, { all: true, verbatim: true });
    const privateAddresses = records.map((record) => record.address).filter(isPrivateOrLocalHost);
    return privateAddresses.length > 0
      ? [`DNS resolves to private or local address: ${privateAddresses.join(", ")}`]
      : [];
  } catch (error) {
    return [`DNS resolution failed: ${error instanceof Error ? error.message : String(error)}`];
  }
}

function cleanHomeDomain(homeDomain: string): string {
  return homeDomain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

export async function fetchStellarToml(homeDomain: string, fetchImpl: typeof fetch = fetch): Promise<TomlFetchResult> {
  const cleaned = cleanHomeDomain(homeDomain);
  const requestedUrl = `https://${cleaned}/.well-known/stellar.toml`;

  const initialSafety = assertSep1FetchAllowed(requestedUrl);
  if (!initialSafety.allowed) {
    const privateHit = initialSafety.issues.some((issue) => issue.includes("private") || issue.includes("localhost"));
    const httpsHit = initialSafety.issues.some((issue) => issue.includes("HTTPS"));

    return {
      outcome: privateHit ? "private_or_local_target" : httpsHit ? "tls_or_https_required" : "malformed",
      requestedUrl,
      finalUrl: null,
      httpStatus: null,
      redirectCount: 0,
      contentType: null,
      byteLength: null,
      body: null,
      issues: initialSafety.issues,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), METADATA_LIMITS.fetchTimeoutMs);

  try {
    let currentUrl = requestedUrl;
    let redirectCount = 0;

    for (;;) {
      const urlSafety = assertSep1FetchAllowed(currentUrl);
      if (!urlSafety.allowed) {
        const privateHit = urlSafety.issues.some((issue) => issue.includes("private") || issue.includes("localhost"));
        return {
          outcome: privateHit ? "private_or_local_target" : "tls_or_https_required",
          requestedUrl,
          finalUrl: currentUrl,
          httpStatus: null,
          redirectCount,
          contentType: null,
          byteLength: null,
          body: null,
          issues: urlSafety.issues,
        };
      }

      const dnsIssues = await assertResolvedHostIsPublic(currentUrl);
      if (dnsIssues.length > 0) {
        const privateHit = dnsIssues.some((issue) => issue.includes("private") || issue.includes("local"));
        return {
          outcome: privateHit ? "private_or_local_target" : "dns_failure",
          requestedUrl,
          finalUrl: currentUrl,
          httpStatus: null,
          redirectCount,
          contentType: null,
          byteLength: null,
          body: null,
          issues: dnsIssues,
        };
      }

      const response = await fetchImpl(currentUrl, {
        signal: controller.signal,
        redirect: "manual",
        headers: { Accept: "text/plain, text/toml, application/toml, */*" },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          return {
            outcome: "redirect_blocked",
            requestedUrl,
            finalUrl: currentUrl,
            httpStatus: response.status,
            redirectCount,
            contentType: null,
            byteLength: null,
            body: null,
            issues: ["redirect missing location"],
          };
        }

        if (redirectCount >= METADATA_LIMITS.maxRedirects) {
          return {
            outcome: "redirect_blocked",
            requestedUrl,
            finalUrl: currentUrl,
            httpStatus: response.status,
            redirectCount,
            contentType: null,
            byteLength: null,
            body: null,
            issues: ["SEP-1 redirect limit exceeded"],
          };
        }

        redirectCount += 1;
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      if (!response.ok) {
        return {
          outcome: "http_error",
          requestedUrl,
          finalUrl: currentUrl,
          httpStatus: response.status,
          redirectCount,
          contentType: response.headers.get("content-type"),
          byteLength: null,
          body: null,
          issues: [`HTTP status ${response.status}`],
        };
      }

      const contentType = response.headers.get("content-type") ?? "";
      const declaredLength = Number(response.headers.get("content-length") ?? 0);
      if (Number.isFinite(declaredLength) && declaredLength > METADATA_LIMITS.maxTomlBytes) {
        return {
          outcome: "oversized",
          requestedUrl,
          finalUrl: currentUrl,
          httpStatus: response.status,
          redirectCount,
          contentType,
          byteLength: declaredLength,
          body: null,
          issues: ["SEP-1 response size limit exceeded"],
        };
      }

      const text = await response.text();
      const responseSafety = assertSep1FetchAllowed(currentUrl, contentType, text.length);
      if (!responseSafety.allowed) {
        const oversized = responseSafety.issues.some((issue) => issue.includes("size"));
        return {
          outcome: oversized ? "oversized" : "malformed",
          requestedUrl,
          finalUrl: currentUrl,
          httpStatus: response.status,
          redirectCount,
          contentType,
          byteLength: text.length,
          body: null,
          issues: responseSafety.issues,
        };
      }

      return {
        outcome: "ok",
        requestedUrl,
        finalUrl: currentUrl,
        httpStatus: response.status,
        redirectCount,
        contentType,
        byteLength: text.length,
        body: text,
        issues: [],
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const timedOut = message.toLowerCase().includes("abort") || message.toLowerCase().includes("timeout");

    return {
      outcome: timedOut ? "timeout" : "malformed",
      requestedUrl,
      finalUrl: null,
      httpStatus: null,
      redirectCount: 0,
      contentType: null,
      byteLength: null,
      body: null,
      issues: [message],
    };
  } finally {
    clearTimeout(timer);
  }
}

export function createProductionTomlFetcher(): TomlFetcher {
  return ({ homeDomain }) => fetchStellarToml(homeDomain);
}

/** Pure URL safety probe used by tests without network I/O. */
export function probeTomlUrlSafety(url: string): { allowed: boolean; issues: string[] } {
  return assertSep1FetchAllowed(url);
}
