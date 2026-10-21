import { describe, expect, it } from "vitest";
import { isPublicIpv4, parsePublicHttpsUrl } from "@/server/security/publicHttpsText";

describe("untrusted stellar.toml URL guard", () => {
  it("rejects local targets, credentials, and insecure redirects", () => {
    for (const url of [
      "https://127.0.0.1/.well-known/stellar.toml",
      "https://[::ffff:127.0.0.1]/.well-known/stellar.toml",
      "https://metadata.google.internal/.well-known/stellar.toml",
      "https://user:secret@example.com/.well-known/stellar.toml",
      "http://example.com/.well-known/stellar.toml",
    ]) {
      expect(() => parsePublicHttpsUrl(url)).toThrow();
    }
    expect(parsePublicHttpsUrl("https://stellar.org/.well-known/stellar.toml").hostname).toBe("stellar.org");
  });

  it("accepts only public IPv4 DNS answers", () => {
    for (const address of ["127.0.0.1", "10.1.2.3", "169.254.169.254", "172.20.1.2", "192.168.1.1", "100.100.100.100", "203.0.113.5", "::ffff:127.0.0.1"]) {
      expect(isPublicIpv4(address)).toBe(false);
    }
    expect(isPublicIpv4("8.8.8.8")).toBe(true);
  });
});
