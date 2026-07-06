export type UrlSafetyResult = {
  url: string;
  safe: boolean;
  normalizedUrl?: string;
  hostname?: string;
  issues: string[];
  redirectLimit: number;
};

const privateIpPatterns = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^169\.254\./,
  /^0\./,
];

function isPrivateOrLocalHost(hostname: string) {
  const normalized = hostname.toLowerCase();

  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "0.0.0.0" ||
    normalized === "::1" ||
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
