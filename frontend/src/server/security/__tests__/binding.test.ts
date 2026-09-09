import { describe, expect, it } from "vitest";
import { extractDeviceBinding, validateDeviceBinding } from "../session/binding";

describe("Session Device Binding", () => {
  it("derives deterministic hash for identical request headers", () => {
    const headersA = {
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      "accept-language": "en-US,en;q=0.9",
      "sec-ch-ua": '"Chromium";v="120"',
    };

    const headersB = {
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      "accept-language": "en-US,en;q=0.9",
      "sec-ch-ua": '"Chromium";v="120"',
    };

    const bindingA = extractDeviceBinding(headersA);
    const bindingB = extractDeviceBinding(headersB);

    expect(bindingA.bindingHash).toBe(bindingB.bindingHash);
    expect(bindingA.deviceHint).toBe("macOS · Chrome");
    expect(validateDeviceBinding(bindingA.bindingHash, bindingB.bindingHash)).toBe(true);
  });

  it("produces different hashes for different devices", () => {
    const desktop = {
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0.0.0 Safari/537.36",
      "accept-language": "en-US",
    };

    const mobile = {
      "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
      "accept-language": "en-US",
    };

    const desktopBinding = extractDeviceBinding(desktop);
    const mobileBinding = extractDeviceBinding(mobile);

    expect(desktopBinding.bindingHash).not.toBe(mobileBinding.bindingHash);
    expect(mobileBinding.deviceHint).toBe("iOS · Safari");
    expect(validateDeviceBinding(desktopBinding.bindingHash, mobileBinding.bindingHash)).toBe(false);
  });

  it("handles empty or missing headers safely", () => {
    const binding = extractDeviceBinding({});
    expect(binding.bindingHash).toBeDefined();
    expect(binding.bindingHash.length).toBe(64);
    expect(binding.deviceHint).toBe("Browser Client");
  });
});
