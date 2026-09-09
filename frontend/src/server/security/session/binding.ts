import crypto from "crypto";
import type { DeviceBindingInfo } from "./types";

function getHeaderValue(
  source: Request | Headers | Record<string, string | string[] | undefined>,
  name: string
): string {
  if (!source) return "";
  if ("headers" in source && typeof (source as Request).headers?.get === "function") {
    return (source as Request).headers.get(name) ?? "";
  }
  if (typeof (source as Headers).get === "function") {
    return (source as Headers).get(name) ?? "";
  }
  const rec = source as Record<string, string | string[] | undefined>;
  const val = rec[name.toLowerCase()] ?? rec[name];
  if (Array.isArray(val)) return val[0] ?? "";
  return val ?? "";
}

function parseDeviceHint(userAgent: string): string {
  if (!userAgent || typeof userAgent !== "string") {
    return "Browser Client";
  }

  let os = "Unknown OS";
  if (/iphone|ipad|ipod/i.test(userAgent)) {
    os = "iOS";
  } else if (/macintosh|mac os x/i.test(userAgent)) {
    os = "macOS";
  } else if (/android/i.test(userAgent)) {
    os = "Android";
  } else if (/windows/i.test(userAgent)) {
    os = "Windows";
  } else if (/linux/i.test(userAgent)) {
    os = "Linux";
  }

  let browser = "Browser";
  if (/edg\//i.test(userAgent)) {
    browser = "Edge";
  } else if (/chrome|crios/i.test(userAgent) && !/opr\//i.test(userAgent)) {
    browser = "Chrome";
  } else if (/firefox|fxios/i.test(userAgent)) {
    browser = "Firefox";
  } else if (/safari/i.test(userAgent) && !/chrome|crios/i.test(userAgent)) {
    browser = "Safari";
  } else if (/opr\//i.test(userAgent)) {
    browser = "Opera";
  }

  return `${os} · ${browser}`;
}

/**
 * Extracts normalized device binding attributes and derives a deterministic cryptographic hash and safe display hint.
 *
 * @param source An incoming HTTP Request, Headers object, or header dictionary.
 * @returns DeviceBindingInfo containing the SHA-256 binding hash and sanitized device hint.
 */
export function extractDeviceBinding(
  source: Request | Headers | Record<string, string | string[] | undefined>
): DeviceBindingInfo {
  const userAgent = getHeaderValue(source, "user-agent").trim();
  const acceptLanguage = getHeaderValue(source, "accept-language").trim().split(",")[0] ?? "";
  const secChUa = getHeaderValue(source, "sec-ch-ua").trim();
  const explicitClientBinding = (
    getHeaderValue(source, "x-device-binding") || getHeaderValue(source, "x-device-fingerprint")
  ).trim();

  const components = [
    userAgent.toLowerCase(),
    acceptLanguage.toLowerCase(),
    secChUa.toLowerCase(),
    explicitClientBinding,
  ];

  const canonicalString = components.join("||");
  const bindingHash = crypto.createHash("sha256").update(canonicalString).digest("hex");
  const deviceHint = parseDeviceHint(userAgent);

  return {
    bindingHash,
    deviceHint,
  };
}

/**
 * Compares two device binding hashes in constant time to prevent timing attacks.
 *
 * @param expectedHash The SHA-256 hash registered on the session record.
 * @param presentedHash The SHA-256 hash derived from the current incoming request.
 * @returns True only if both hashes match identically.
 */
export function validateDeviceBinding(expectedHash: string, presentedHash: string): boolean {
  if (!expectedHash || !presentedHash) return false;
  if (expectedHash.length !== presentedHash.length) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedHash, "utf-8"),
      Buffer.from(presentedHash, "utf-8")
    );
  } catch {
    return false;
  }
}
