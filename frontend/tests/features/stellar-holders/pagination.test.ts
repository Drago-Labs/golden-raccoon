import { describe, expect, it } from "vitest";
import { HOLDER_LIMITS } from "@/server/research/stellar-holders/limits";
import { pageHolderTrustlines } from "@/server/research/stellar-holders/holderReader";
import { partial } from "./fixtures";

describe("trustline pagination", () => {
  it("stops at the page cap and does not request the next cursor", async () => {
    const cursors: Array<string | null> = [];
    const limits: number[] = [];
    const paged = await pageHolderTrustlines(async (cursor, limit) => {
      cursors.push(cursor);
      limits.push(limit);

      if (cursor === null) {
        return { records: [{ accountId: "A", balance: "1.0000000" }, { accountId: "B", balance: "1.0000000" }], nextCursor: "c2" };
      }

      if (cursor === "c2") {
        return { records: [{ accountId: "C", balance: "1.0000000" }], nextCursor: "c3" };
      }

      return { records: [{ accountId: "D", balance: "1.0000000" }], nextCursor: null };
    }, { pageSize: 2, maxPages: 2, maxHolders: HOLDER_LIMITS.maxHolders });

    expect(paged.pagesRead).toBe(2);
    expect(paged.truncated).toBe(true);
    expect(paged.holders.map((holder) => holder.accountId)).toEqual(["A", "B", "C"]);
    expect(cursors).toEqual([null, "c2"]);
    expect(limits).toEqual([2, 2]);
  });

  it("stops when a cursor repeats", async () => {
    const paged = await pageHolderTrustlines(async (cursor) => {
      if (cursor === null) return { records: [{ accountId: "A", balance: "1.0000000" }], nextCursor: "c2" };

      return { records: [], nextCursor: "c2" };
    }, { pageSize: 10, maxPages: 5, maxHolders: 100 });

    expect(paged.duplicateCursor).toBe(true);
    expect(paged.truncated).toBe(true);
    expect(paged.holders).toHaveLength(1);
    expect(paged.pagesRead).toBe(2);
  });

  it("counts a repeated account once", async () => {
    const paged = await pageHolderTrustlines(async () => ({
      records: [
        { accountId: "A", balance: "2.0000000" },
        { accountId: "A", balance: "9.0000000" },
      ],
      nextCursor: null,
    }), { pageSize: 10, maxPages: 2, maxHolders: 100 });

    expect(paged.holders).toEqual([{ accountId: "A", balance: "2.0000000" }]);
    expect(paged.duplicateAccount).toBe(true);
    expect(paged.truncated).toBe(true);
  });

  it("clamps the page size to the published Horizon limit", async () => {
    let seen = 0;

    await pageHolderTrustlines(async (_cursor, limit) => {
      seen = limit;
      return { records: [], nextCursor: null };
    }, { pageSize: 500, maxPages: 99, maxHolders: 50_000 });

    expect(seen).toBe(HOLDER_LIMITS.maxPageSize);
  });

  it("stops the partial-coverage recording after the first page when asked", async () => {
    const fixture = partial;
    const paged = await pageHolderTrustlines(async (cursor, limit) => {
      const page = fixture.pages.find((item) => item.cursor === cursor);

      if (!page) return { records: [], nextCursor: null };

      return { records: page.records.slice(0, limit), nextCursor: page.nextCursor };
    }, { pageSize: HOLDER_LIMITS.pageSizeDefault, maxPages: 1, maxHolders: HOLDER_LIMITS.maxHolders });

    expect(paged.pagesRead).toBe(1);
    expect(paged.truncated).toBe(true);
    expect(paged.holders.map((holder) => holder.accountId)).not.toContain(fixture.pages[1].records[0].accountId);
  });
});
