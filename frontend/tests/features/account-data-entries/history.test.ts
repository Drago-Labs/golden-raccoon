import { describe, expect, it } from "vitest";
import { buildEntryHistory } from "@/server/research/account-data-entries/entryHistory";
import { accountUrl, operationsUrl, readManageDataHistory } from "@/server/research/account-data-entries/entryReader";
import { horizonBase } from "@/server/research/account-data-entries/networkIdentity";
import { deletedFixture, textFixture } from "./fixtures";

describe("manage_data history", () => {
  it("deduplicates operations and keeps the last value on a delete", () => {
    const history = buildEntryHistory(
      deletedFixture.operations.map((operation) => ({
        id: operation.id,
        pagingToken: operation.paging_token,
        key: operation.name ?? "",
        valueBase64: operation.value,
        sourceAccount: operation.source_account,
        ledger: operation.ledger,
      })),
    );
    const events = history.get("config") ?? [];
    expect(events.map((event) => event.action)).toEqual(["set", "change", "delete"]);
    expect(events[2]?.lastValueUtf8).toBe("https://example.com/a");
    expect(events[2]?.sourceAccount).toBe(deletedFixture.operations[2]?.source_account);
  });

  it("drops a duplicated paging token", () => {
    const history = buildEntryHistory(
      textFixture.operations
        .filter((operation) => operation.name === "issuer")
        .map((operation) => ({
          id: operation.id,
          pagingToken: operation.paging_token,
          key: operation.name ?? "",
          valueBase64: operation.value,
          sourceAccount: operation.source_account,
          ledger: operation.ledger,
        })),
    );
    expect(history.get("issuer")).toHaveLength(2);
  });

  it("follows a cursor and labels a full final page as truncated", async () => {
    const pages = [
      {
        _embedded: {
          records: [
            { id: "1", paging_token: "1", type: "manage_data", name: "config", value: textFixture.account.data.config, source_account: textFixture.account.id, ledger: 4 },
            { id: "1", paging_token: "1", type: "manage_data", name: "config", value: textFixture.account.data.config, source_account: textFixture.account.id, ledger: 4 },
          ],
        },
      },
      {
        _embedded: {
          records: [
            { id: "2", paging_token: "2", type: "manage_data", name: "config", value: null, source_account: textFixture.account.id, ledger: 2 },
          ],
        },
      },
    ];
    let calls = 0;
    const history = await readManageDataHistory("stellar-pubnet", textFixture.account.id, async (url) => {
      expect(String(url)).not.toContain("horizon-testnet");
      const page = pages[calls] ?? { _embedded: { records: [] } };
      calls += 1;
      return new Response(JSON.stringify(page), { status: 200 });
    }, { pageSize: 2, maxPages: 2, maxOperations: 10 });

    expect(history.status).toBe("ok");
    if (history.status === "ok") {
      expect(history.value.truncated).toBe(false);
      expect(history.value.operations.map((operation) => operation.ledger)).toEqual([4, 2]);
      expect(history.value.oldestLedger).toBe(2);
    }
    expect(horizonBase("stellar-pubnet")).toBe("https://horizon.stellar.org");
    expect(accountUrl("stellar-pubnet", textFixture.account.id)).not.toContain("horizon-testnet");
    expect(operationsUrl("stellar-testnet", textFixture.account.id, null)).toContain("https://horizon-testnet.stellar.org/accounts/");
  });
});
