import { describe, expect, it } from "vitest";
import {
  decodeContractEvents,
  type ContractEventSpecDef,
  type RawEventWindowResponse,
} from "@/server/research/event-decoder";
import { CONTRACT_ID, depsFromFixture } from "./fixtures";
import tokenTransferFixture from "./data/token-transfer-events.json";
import unmatchedFixture from "./data/unmatched-event.json";
import outsideRetentionFixture from "./data/outside-retention.json";

describe("decodeContractEvents service", () => {
  it("decodes matching events to typed values", async () => {
    const report = await decodeContractEvents(
      {
        contractId: CONTRACT_ID,
        startLedger: 900000,
        endLedger: 900500,
        network: "stellar-testnet",
      },
      depsFromFixture(
        tokenTransferFixture as unknown as {
          specs: ContractEventSpecDef[];
          window: RawEventWindowResponse;
        },
      ),
    );
    expect(report.state).toBe("complete");
    expect(report.events[0]!.matchedSpecName).toBe("TransferEvent");
  });

  it("preserves raw event with mismatch reason when spec does not match", async () => {
    const report = await decodeContractEvents(
      {
        contractId: CONTRACT_ID,
        startLedger: 900000,
        endLedger: 900500,
        network: "stellar-testnet",
      },
      depsFromFixture(
        unmatchedFixture as unknown as {
          specs: ContractEventSpecDef[];
          window: RawEventWindowResponse;
        },
      ),
    );
    expect(report.state).toBe("partial");
    expect(report.events[0]!.mismatchReason).toMatch(/custom_mystery_op/);
  });

  it("reports ledgers outside retention as partial/unavailable window rather than empty", async () => {
    const report = await decodeContractEvents(
      {
        contractId: CONTRACT_ID,
        startLedger: 900000,
        endLedger: 900500,
        network: "stellar-testnet",
      },
      depsFromFixture(
        outsideRetentionFixture as unknown as {
          specs: ContractEventSpecDef[];
          window: RawEventWindowResponse;
        },
      ),
    );
    expect(report.state).toBe("partial");
    expect(report.retention?.outsideRetention).toBe(true);
  });
});
