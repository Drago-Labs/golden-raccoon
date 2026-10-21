import { describe, expect, it } from "vitest";
import { formatDidChange, isRecentChange } from "@/server/research/account-data-entries/recency";
import { dataEntryReserve } from "@/server/research/account-data-entries/reserveCost";

describe("recency and reserve", () => {
  it("flags a change inside the ledger window and not one ledger before it", () => {
    expect(isRecentChange(70, 100, 30)).toBe(true);
    expect(isRecentChange(69, 100, 30)).toBe(false);
    expect(isRecentChange(null, 100, 30)).toBe(false);
  });

  it("flags a format change only when both formats are known and different", () => {
    expect(formatDidChange("text", "account_id")).toBe(true);
    expect(formatDidChange("text", "text")).toBe(false);
    expect(formatDidChange(null, "url")).toBe(false);
  });

  it("charges one base reserve per current data entry", () => {
    expect(dataEntryReserve(4)).toEqual({
      perEntryXlm: "0.5000000",
      totalXlm: "2.0000000",
      totalStroops: "20000000",
    });
  });
});
