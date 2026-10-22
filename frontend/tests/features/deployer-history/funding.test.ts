import { describe, expect, it } from "vitest";
import { traceFundingTrail } from "@/server/research/deployer-history/fundingTrail";
import { recordedDeployerRpc, wallet } from "./fixtures";

const funder = "0x1111111111111111111111111111111111111111";
const fundersFunder = "0x2222222222222222222222222222222222222222";

describe("traceFundingTrail", () => {
  it("finds the first incoming value transfer within the window", async () => {
    const rpc = recordedDeployerRpc({
      latestBlock: "1000",
      codeFromBlock: {},
      blocks: { "95": [{ hash: "0xfund", from: funder, to: wallet, nonce: 0, value: "0xde0b6b3a7640000" }] },
    });

    const hops = await traceFundingTrail(rpc, wallet, 100n, 1, 30n);
    expect(hops).toEqual([
      { hop: 1, address: wallet, transactions: [{ from: funder, to: wallet, blockNumber: 95, txHash: "0xfund", valueWei: "0xde0b6b3a7640000" }] },
    ]);
  });

  it("walks multiple hops back through the funding chain", async () => {
    const rpc = recordedDeployerRpc({
      latestBlock: "1000",
      codeFromBlock: {},
      blocks: {
        "95": [{ hash: "0xfund1", from: funder, to: wallet, nonce: 0, value: "0x1" }],
        "90": [{ hash: "0xfund2", from: fundersFunder, to: funder, nonce: 0, value: "0x1" }],
      },
    });

    const hops = await traceFundingTrail(rpc, wallet, 100n, 2, 30n);
    expect(hops).toHaveLength(2);
    expect(hops[0].address).toBe(wallet);
    expect(hops[1].address).toBe(funder);
    expect(hops[1].transactions[0].from).toBe(fundersFunder);
  });

  it("stops early (fewer than maxHops) when a hop finds no funding transaction", async () => {
    const rpc = recordedDeployerRpc({ latestBlock: "1000", codeFromBlock: {}, blocks: {} });
    const hops = await traceFundingTrail(rpc, wallet, 100n, 2, 30n);
    expect(hops).toEqual([{ hop: 1, address: wallet, transactions: [] }]);
  });

  it("ignores zero-value transactions — they aren't funding", async () => {
    const rpc = recordedDeployerRpc({
      latestBlock: "1000",
      codeFromBlock: {},
      blocks: { "95": [{ hash: "0xzero", from: funder, to: wallet, nonce: 0, value: "0x0" }] },
    });
    const hops = await traceFundingTrail(rpc, wallet, 100n, 1, 30n);
    expect(hops[0].transactions).toEqual([]);
  });

  it("breaks a funding cycle instead of looping forever", async () => {
    const rpc = recordedDeployerRpc({
      latestBlock: "1000",
      codeFromBlock: {},
      blocks: {
        "95": [{ hash: "0xfund1", from: funder, to: wallet, nonce: 0, value: "0x1" }],
        "90": [{ hash: "0xfund2", from: wallet, to: funder, nonce: 0, value: "0x1" }], // funds the original address — a cycle
      },
    });

    const hops = await traceFundingTrail(rpc, wallet, 100n, 5, 30n);
    expect(hops).toHaveLength(2); // stops once it would revisit `wallet`
  });
});
