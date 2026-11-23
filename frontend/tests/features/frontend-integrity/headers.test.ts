import { describe, expect, it } from "vitest";
import { parseDomain } from "@/server/research/frontend-integrity/domainInput";
import { FrontendIntegrityError } from "@/server/research/frontend-integrity/errors";
import { readSecurityHeaders } from "@/server/research/frontend-integrity/headerReader";

describe("security headers are copied and a bad domain is rejected", () => {
  it("keeps an absent HSTS header as null", () => {
    expect(readSecurityHeaders({ "x-frame-options": "DENY" }).hsts).toBeNull();
    expect(readSecurityHeaders({ "x-frame-options": "DENY" }).frame).toBe("DENY");
    expect(parseDomain("App.Example.")).toBe("app.example");
    expect(() => parseDomain("https://app.example")).toThrow(FrontendIntegrityError);
  });
});
