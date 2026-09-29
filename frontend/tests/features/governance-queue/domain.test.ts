import { describe, expect, it } from "vitest";
import { decodePendingQueue, readPendingQueue } from "@/server/stellar/governance";
import { failingAdapter, queueAdapter, sampleItems } from "./fixtures";

describe("governance queue decode", () => {
  it("decodes a non-empty queue", () => {
    const decoded = decodePendingQueue(sampleItems);
    expect(decoded.state).toBe("non_empty");
    expect(decoded.items[0]?.payloadHash).toBe(sampleItems[0].payloadHash);
  });

  it("keeps empty distinct from provider failure", async () => {
    const empty = await readPendingQueue({
      adapter: queueAdapter([]),
      env: {
        NEXT_PUBLIC_STELLAR_GOVERNANCE_CONTRACT_ID: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHK3M",
        NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
      },
    });
    expect(empty.state).toBe("empty");
    expect(empty.items).toEqual([]);

    const failed = await readPendingQueue({
      adapter: failingAdapter(),
      env: {
        NEXT_PUBLIC_STELLAR_GOVERNANCE_CONTRACT_ID: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHK3M",
        NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
      },
    });
    expect(failed.state).toBe("provider_error");
    expect(failed.items).toEqual([]);
  });

  it("flags malformed and stale entries", async () => {
    expect(decodePendingQueue({ nope: true }).state).toBe("malformed");
    const stale = await readPendingQueue({
      adapter: queueAdapter([{ ...sampleItems[0], sourceLedger: 999 }], 50),
      env: {
        NEXT_PUBLIC_STELLAR_GOVERNANCE_CONTRACT_ID: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHK3M",
        NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
      },
    });
    expect(stale.state).toBe("stale");
  });

  it("marks cancelled proposals as not ready", async () => {
    const result = await readPendingQueue({
      adapter: queueAdapter([{ ...sampleItems[0], cancelled: true, effectiveAt: 1 }], 50),
      env: {
        NEXT_PUBLIC_STELLAR_GOVERNANCE_CONTRACT_ID: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHK3M",
        NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
      },
      nowSecs: 10,
    });
    expect(result.items[0]?.cancelled).toBe(true);
  });
});
