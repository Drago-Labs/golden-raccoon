/**
 * Bounded, fail-closed page fetch with explicit outcomes.
 *
 * Redirects are followed manually so each hop is re-checked for a private or
 * local target and for size. This mirrors the established pattern in
 * `server/research/metadata-integrity/tomlFetch.ts`, generalized from a
 * single SEP-1 TOML path to an arbitrary registry-listed policy page.
 */
import { lookup } from "node:dns/promises";
import { assertExternalFetchAllowed, isPrivateOrLocalHost } from "@/server/security/urlSafety";
import { POLICY_CHANGE_LIMITS } from "./limits";
import type { PageFetchResult, PageFetcher } from "./schema";

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

export async function fetchPolicyPage(url: string, fetchImpl: typeof fetch = fetch): Promise<PageFetchResult> {
  const requestedUrl = url;

  const initialSafety = assertExternalFetchAllowed(requestedUrl);
  if (!initialSafety.allowed) {
    const privateHit = initialSafety.issues.some((issue) => issue.includes("private") || issue.includes("localhost"));
    return {
      outcome: privateHit ? "private_or_local_target" : "http_error",
      requestedUrl,
      finalUrl: null,
      httpStatus: null,
      redirectChain: [],
      contentType: null,
      byteLength: null,
      body: null,
      issues: initialSafety.issues,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), POLICY_CHANGE_LIMITS.fetchTimeoutMs);

  try {
    let currentUrl = requestedUrl;
    const redirectChain: string[] = [];

    for (;;) {
      const urlSafety = assertExternalFetchAllowed(currentUrl);
      if (!urlSafety.allowed) {
        const privateHit = urlSafety.issues.some((issue) => issue.includes("private") || issue.includes("localhost"));
        return {
          outcome: privateHit ? "private_or_local_target" : "http_error",
          requestedUrl,
          finalUrl: currentUrl,
          httpStatus: null,
          redirectChain,
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
          redirectChain,
          contentType: null,
          byteLength: null,
          body: null,
          issues: dnsIssues,
        };
      }

      const response = await fetchImpl(currentUrl, {
        signal: controller.signal,
        redirect: "manual",
        headers: { Accept: "text/html, application/xhtml+xml, text/plain, */*" },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirectChain.length >= POLICY_CHANGE_LIMITS.maxRedirects) {
          return {
            outcome: "redirect_blocked",
            requestedUrl,
            finalUrl: currentUrl,
            httpStatus: response.status,
            redirectChain,
            contentType: null,
            byteLength: null,
            body: null,
            issues: [location ? "redirect limit exceeded" : "redirect missing location"],
          };
        }

        currentUrl = new URL(location, currentUrl).toString();
        redirectChain.push(currentUrl);
        continue;
      }

      if (!response.ok) {
        return {
          outcome: "http_error",
          requestedUrl,
          finalUrl: currentUrl,
          httpStatus: response.status,
          redirectChain,
          contentType: response.headers.get("content-type"),
          byteLength: null,
          body: null,
          issues: [`HTTP status ${response.status}`],
        };
      }

      const contentType = response.headers.get("content-type") ?? "";
      const isTextLike = /text\/html|application\/xhtml\+xml|text\/plain/i.test(contentType) || contentType === "";
      if (!isTextLike) {
        return {
          outcome: "unsupported_content_type",
          requestedUrl,
          finalUrl: currentUrl,
          httpStatus: response.status,
          redirectChain,
          contentType,
          byteLength: null,
          body: null,
          issues: [`unsupported content type: ${contentType}`],
        };
      }

      const declaredLength = Number(response.headers.get("content-length") ?? 0);
      if (Number.isFinite(declaredLength) && declaredLength > POLICY_CHANGE_LIMITS.maxPageBytes) {
        return {
          outcome: "oversized",
          requestedUrl,
          finalUrl: currentUrl,
          httpStatus: response.status,
          redirectChain,
          contentType,
          byteLength: declaredLength,
          body: null,
          issues: ["page size limit exceeded"],
        };
      }

      const text = await response.text();
      if (text.length > POLICY_CHANGE_LIMITS.maxPageBytes) {
        return {
          outcome: "oversized",
          requestedUrl,
          finalUrl: currentUrl,
          httpStatus: response.status,
          redirectChain,
          contentType,
          byteLength: text.length,
          body: null,
          issues: ["page size limit exceeded"],
        };
      }

      return {
        outcome: "ok",
        requestedUrl,
        finalUrl: currentUrl,
        httpStatus: response.status,
        redirectChain,
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
      outcome: timedOut ? "timeout" : "http_error",
      requestedUrl,
      finalUrl: null,
      httpStatus: null,
      redirectChain: [],
      contentType: null,
      byteLength: null,
      body: null,
      issues: [message],
    };
  } finally {
    clearTimeout(timer);
  }
}

export function createProductionPageFetcher(): PageFetcher {
  return ({ url }) => fetchPolicyPage(url);
}

/** Pure URL safety probe used by tests without network I/O. */
export function probePolicyUrlSafety(url: string): { allowed: boolean; issues: string[] } {
  return assertExternalFetchAllowed(url);
}
