import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GovernanceQueueWorkspace } from "@/components/research/governance-queue/GovernanceQueueWorkspace";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GovernanceQueueWorkspace", () => {
  it("is operable by keyboard and announces queue state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          state: "non_empty",
          contractId: "CABC",
          ledger: 42,
          items: [
            {
              id: "1",
              targetContract: "CTARGET",
              payloadHash: "0xdead",
              effectiveAt: "100",
              cancelled: false,
            },
          ],
          readiness: [{ id: "1", ready: false, note: "waiting" }],
          warnings: [],
          scoreUnchanged: true,
        }),
      })),
    );

    render(<GovernanceQueueWorkspace />);
    const button = screen.getByRole("button", { name: /Read pending queue/i });
    button.focus();
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/State: non_empty/i)).toBeTruthy();
    });
    expect(screen.getByRole("table", { name: /Pending governance proposals/i })).toBeTruthy();
    expect(screen.getByText("0xdead")).toBeTruthy();
    expect(screen.getAllByText(/timelock|waiting/i).length).toBeGreaterThan(0);
  });

  it("surfaces provider failures as alerts, not empty success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 502,
        json: async () => ({ error: "RPC failed" }),
      })),
    );

    render(<GovernanceQueueWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: /Read pending queue/i }));
    await waitFor(() => {
      expect(screen.getAllByText(/RPC failed/i).length).toBeGreaterThan(0);
    });
  });
});
