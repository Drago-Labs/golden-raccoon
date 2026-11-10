import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventDecoderWorkbench } from "@/components/research/event-decoder/EventDecoderWorkbench";
import {
  decodeContractEvents,
  type ContractEventSpecDef,
  type RawEventWindowResponse,
} from "@/server/research/event-decoder";
import { CONTRACT_ID, depsFromFixture } from "./fixtures";
import tokenTransferFixture from "./data/token-transfer-events.json";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("EventDecoderWorkbench", () => {
  it("renders decoded events, raw ScVal toggle, and retention coverage notice", async () => {
    const sampleReport = await decodeContractEvents(
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
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ report: sampleReport }),
      })),
    );

    render(<EventDecoderWorkbench />);
    fireEvent.click(screen.getByRole("button", { name: "Decode contract events" }));

    await waitFor(() => {
      expect(screen.getByRole("region", { name: "Decoded contract events results" })).toBeTruthy();
    });
    expect(screen.getByText("TransferEvent")).toBeTruthy();
    expect(screen.getByText("18446744073709551616")).toBeTruthy();
    expect(screen.getByTestId("coverage-notice").textContent).toMatch(/within the RPC retention window/);
  });
});
