import { describe, expect, it } from "vitest";
import { reserveRequestSchema } from "@/server/research/reserve-attestation";
import { baseRequest, report } from "./fixtures";

describe("reserve attestation request validation", () => {
  it("accepts a well-formed request", () => {
    expect(reserveRequestSchema.safeParse(baseRequest()).success).toBe(true);
  });

  it("requires at least one registry entry", () => {
    expect(reserveRequestSchema.safeParse(baseRequest({ registry: [] })).success).toBe(false);
  });

  it("rejects a document hash that is not a 64-character hex digest", () => {
    expect(reserveRequestSchema.safeParse(baseRequest({ reports: [report({ documentHash: "not-a-hash" })] })).success).toBe(false);
  });

  it("rejects a non-decimal claimed figure and a non-URL document link", () => {
    expect(reserveRequestSchema.safeParse(baseRequest({ reports: [report({ claimedAssets: "lots" })] })).success).toBe(false);
    expect(reserveRequestSchema.safeParse(baseRequest({ reports: [report({ documentUrl: "not a url" })] })).success).toBe(false);
  });

  it("rejects an unknown sourceType", () => {
    expect(
      reserveRequestSchema.safeParse(
        baseRequest({ reports: [{ ...report(), sourceType: "rumor" } as unknown as ReturnType<typeof report>] }),
      ).success,
    ).toBe(false);
  });
});
