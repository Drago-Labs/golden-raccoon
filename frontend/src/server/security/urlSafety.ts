export type UrlSafetyResult = {
  url: string;
  safe: boolean;
  normalizedUrl?: string;
  hostname?: string;
  issues: string[];
  redirectLimit: number;
};

export const externalFetchSandboxRules = {
  allowPrivateNetwork: false,
  allowedProtocols: ["https:", "http:"],
  redirectLimit: 3,
  maxResponseBytes: 1_000_000,
  allowedContentTypes: [
    "text/html",
    "application/json",
    "application/rss+xml",
    "application/xml",
    "text/xml",
    "text/plain",
    "text/toml",
    "application/toml",
    "text/x-toml",
    "application/x-toml",
  ],
};

const privateIpPatterns = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^169\.254\./,
  /^0\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^198\.1[89]\./,
];

export function isPrivateOrLocalHost(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "0.0.0.0" ||
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:") ||
    privateIpPatterns.some((pattern) => pattern.test(normalized))
  );
}

function skeletonDomain(hostname: string) {
  return hostname
    .toLowerCase()
    .replace(/^www\./, "")
    .replaceAll("0", "o")
    .replaceAll("1", "l")
    .replaceAll("3", "e")
    .replaceAll("@", "a")
    .replaceAll("-", "");
}

export function getHostname(value?: string) {
  if (!value) return undefined;

  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

export function evaluateUrlSafety(value: string, officialHostname?: string, redirectLimit = 3): UrlSafetyResult {
  const issues: string[] = [];

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();

    if (!["https:", "http:"].includes(url.protocol)) {
      issues.push("unsupported protocol");
    }

    if (isPrivateOrLocalHost(hostname)) {
      issues.push("private or localhost target blocked");
    }

    if (hostname.startsWith("xn--") || /[^\u0000-\u007f]/.test(hostname)) {
      issues.push("punycode or homograph-like hostname");
    }

    if (officialHostname) {
      const official = officialHostname.toLowerCase().replace(/^www\./, "");
      const targetSkeleton = skeletonDomain(hostname);
      const officialSkeleton = skeletonDomain(official);

      if (hostname !== official && targetSkeleton.includes(officialSkeleton) && targetSkeleton !== officialSkeleton) {
        issues.push("suspicious official-domain similarity");
      }
    }

    if (redirectLimit < 0 || redirectLimit > 5) {
      issues.push("redirect limit outside allowed range");
    }

    return {
      url: value,
      safe: issues.length === 0,
      normalizedUrl: `${url.protocol}//${hostname}${url.pathname.replace(/\/$/, "")}`,
      hostname,
      issues,
      redirectLimit,
    };
  } catch {
    return {
      url: value,
      safe: false,
      issues: ["invalid URL"],
      redirectLimit,
    };
  }
}

export function assertExternalFetchAllowed(url: string, contentType?: string, responseBytes?: number) {
  const result = evaluateUrlSafety(url, undefined, externalFetchSandboxRules.redirectLimit);
  const contentAllowed = !contentType || externalFetchSandboxRules.allowedContentTypes.some((allowed) => contentType.toLowerCase().includes(allowed));
  const sizeAllowed = typeof responseBytes !== "number" || responseBytes <= externalFetchSandboxRules.maxResponseBytes;

  return {
    allowed: result.safe && contentAllowed && sizeAllowed,
    issues: [
      ...result.issues,
      ...(contentAllowed ? [] : ["content type not allowed"]),
      ...(sizeAllowed ? [] : ["response size limit exceeded"]),
    ],
    rules: externalFetchSandboxRules,
  };
}

export function assertSep1FetchAllowed(url: string, contentType?: string, responseBytes?: number) {
  const safety = evaluateUrlSafety(url, undefined, 3);
  const isHttps = url.toLowerCase().startsWith("https://");
  const contentAllowed = !contentType || externalFetchSandboxRules.allowedContentTypes.some((allowed) => contentType.toLowerCase().includes(allowed));
  const maxSep1Bytes = 250_000;
  const sizeAllowed = typeof responseBytes !== "number" || responseBytes <= maxSep1Bytes;

  const issues: string[] = [...safety.issues];
  if (!isHttps) issues.push("SEP-1 metadata must be fetched via HTTPS");
  if (!contentAllowed) issues.push("content type not allowed for SEP-1 metadata");
  if (!sizeAllowed) issues.push("SEP-1 response size limit exceeded");

  return {
    allowed: safety.safe && isHttps && contentAllowed && sizeAllowed,
    issues,
  };
}




