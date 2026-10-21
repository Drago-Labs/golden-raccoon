import { describe, expect, it, vi } from "vitest";
import { inspectDataEntries } from "@/server/research/account-data-entries";
import { coverageNotice } from "@/server/research/account-data-entries/coverage";
import { DataEntryError } from "@/server/research/account-data-entries/errors";
import { DATA_ENTRY_LIMITS } from "@/server/research/account-data-entries/limits";
import { assertNetworkPassphrase } from "@/server/research/account-data-entries/networkIdentity";
import { dataEntryRequestSchema } from "@/server/research/account-data-entries/schema";
import { binaryFixture, deletedFixture, depsFor, requestFor, textFixture, unavailableDeps } from "./fixtures";

describe("inspectDataEntries", () => {
  it("decodes current text entries and flags a recent format change", async () => {
    const report = await inspectDataEntries(requestFor(textFixture), depsFor(textFixture));
    const issuer = report.entries.find((entry) => entry.key === "issuer");
    const config = report.entries.find((entry) => entry.key === "config");

    expect(report.state).toBe("complete");
    expect(report.reserveTotalXlm).toBe("2.0000000");
    expect(config?.utf8).toBe("hello");
    expect(config?.recent).toBe(false);
    expect(issuer?.format).toBe("account_id");
    expect(issuer?.recent).toBe(true);
    expect(issuer?.formatChanged).toBe(true);
    expect(issuer?.history).toHaveLength(2);
    expect(report.writesEntries).toBe(false);
    expect(report.coverageNotice).toBe(coverageNotice("complete", report.oldestLedger));
  });

  it("keeps a binary value out of the text field", async () => {
    const report = await inspectDataEntries(requestFor(binaryFixture), depsFor(binaryFixture));
    const pointer = report.entries.find((entry) => entry.key === "pointer");
    expect(pointer?.format).toBe("hash");
    expect(pointer?.utf8).toBeNull();
    expect(pointer?.hex).toBe("ab".repeat(32));
  });

  it("shows a deleted key with its last value and the oldest truncated ledger", async () => {
    const report = await inspectDataEntries(requestFor(deletedFixture), depsFor(deletedFixture));
    const config = report.entries.find((entry) => entry.key === "config");

    expect(report.state).toBe("partial");
    expect(report.historyTruncated).toBe(true);
    expect(report.oldestLedger).toBe(10);
    expect(report.coverageNotice).toMatch(/Oldest ledger reached: 10/);
    expect(config?.present).toBe(false);
    expect(config?.history.at(-1)?.action).toBe("delete");
    expect(config?.history.at(-1)?.lastValueUtf8).toBe("https://example.com/a");
    expect(config?.formatChanged).toBe(true);
  });

  it("returns unavailable without inventing entries", async () => {
    const report = await inspectDataEntries(requestFor(textFixture), unavailableDeps());
    expect(report.state).toBe("unavailable");
    expect(report.entries).toEqual([]);
    expect(report.coverageNotice).toMatch(/No entries were invented/);
  });

  it("rejects a mismatched passphrase before reading", async () => {
    const readAccount = vi.fn(async () => ({ status: "missing" as const }));
    await expect(
      inspectDataEntries(
        { ...requestFor(textFixture), passphrase: "Public Global Stellar Network ; September 2015" },
        { readAccount, readHistory: async () => ({ status: "missing" }) },
      ),
    ).rejects.toBeInstanceOf(DataEntryError);
    expect(readAccount).not.toHaveBeenCalled();
    expect(dataEntryRequestSchema.safeParse({ account: "G", network: "stellar-testnet" }).success).toBe(false);
    expect(() => assertNetworkPassphrase("stellar-pubnet", "Test SDF Network ; September 2015")).toThrow(DataEntryError);
    expect(DATA_ENTRY_LIMITS.maxPages).toBeGreaterThan(0);
  });
});
