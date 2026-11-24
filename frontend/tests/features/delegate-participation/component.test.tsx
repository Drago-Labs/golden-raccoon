import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CoverageNotice } from "@/components/research/delegate-participation/CoverageNotice";
import { DelegateParticipation } from "@/components/research/delegate-participation/DelegateParticipation";
import { DelegateTable } from "@/components/research/delegate-participation/DelegateTable";
import { DelegationChangeList } from "@/components/research/delegate-participation/DelegationChangeList";
import { GovernanceSelector } from "@/components/research/delegate-participation/GovernanceSelector";
import { PowerChart } from "@/components/research/delegate-participation/PowerChart";
import { readDelegateParticipation } from "@/server/research/delegate-participation";
import { DELEGATE_A, DELEGATE_B, E18, GOVERNOR, participationRequest, recordedDeps, TOKEN, type FixtureName } from "./fixtures";

afterEach(() => vi.restoreAllMocks());

/** The report the recorded fixtures produce, so the UI is tested against real service output. */
async function recordedResult(name: FixtureName = "activeDelegates") {
  return readDelegateParticipation(participationRequest(name), recordedDeps(name));
}

describe("GovernanceSelector", () => {
  it("collects the governance identity and states the documented bounds", () => {
    const onSubmit = vi.fn();
    const onTokenChange = vi.fn();
    const { container } = render(
      <GovernanceSelector
        chain="ethereum"
        tokenAddress={TOKEN}
        governorAddress={GOVERNOR}
        delegates=""
        busy={false}
        onChainChange={vi.fn()}
        onTokenChange={onTokenChange}
        onGovernorChange={vi.fn()}
        onDelegatesChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.change(screen.getByLabelText("Governance token address"), { target: { value: DELEGATE_A } });
    expect(onTokenChange).toHaveBeenCalledWith(DELEGATE_A);
    expect(container.textContent).toMatch(/At most 20 delegates and 500000 blocks/);
    fireEvent.click(screen.getByRole("button", { name: "Read delegate participation" }));
    expect(onSubmit).toHaveBeenCalled();
  });
});

describe("DelegateTable", () => {
  it("states each delegate's power and participation as a percentage", async () => {
    const result = await recordedResult();
    render(<DelegateTable delegates={result.report.delegates} />);
    const row = screen.getByRole("rowheader", { name: DELEGATE_A }).closest("tr")!;
    const cells = [...row.querySelectorAll("td")].map((cell) => cell.textContent);
    // Coverage, power at end of range, peak power, eligible, voted, undetermined, participation.
    expect(cells[0]).toBe("Complete");
    expect(cells[1]).toBe((1500n * E18).toString());
    expect(cells.slice(3)).toEqual(["2", "1", "0", "50.00%"]);
    const other = screen.getByRole("rowheader", { name: DELEGATE_B }).closest("tr")!;
    expect([...other.querySelectorAll("td")].pop()?.textContent).toBe("100.00%");
  });

  it("says a dormant delegate's power is unknown and shows no rate", async () => {
    const result = await recordedResult("dormantDelegate");
    render(<DelegateTable delegates={result.report.delegates} />);
    const row = screen.getAllByRole("rowheader")[0].closest("tr")!;
    const cells = [...row.querySelectorAll("td")].map((cell) => cell.textContent);
    expect(cells[1]).toBe("Unknown");
    expect(cells.pop()).toBe("No eligible proposal");
  });

  it("says plainly when no delegate was found", () => {
    render(<DelegateTable delegates={[]} />);
    expect(screen.getByText(/none was found holding power/)).toBeTruthy();
  });
});

describe("PowerChart", () => {
  it("gives the chart a text alternative carrying every checkpoint and its transaction", async () => {
    const result = await recordedResult();
    render(<PowerChart delegates={result.report.delegates} />);
    expect(screen.getByRole("img", { name: /table below this chart carries every checkpoint/ })).toBeTruthy();
    expect(screen.getByRole("rowheader", { name: "1000" })).toBeTruthy();
    expect(screen.getAllByRole("link").length).toBe(3);
  });

  it("says plainly when no checkpoint was recorded", async () => {
    const result = await recordedResult("dormantDelegate");
    render(<PowerChart delegates={result.report.delegates} />);
    expect(screen.getByText(/No delegation checkpoint was recorded/)).toBeTruthy();
  });
});

describe("DelegationChangeList", () => {
  it("links each change to its transaction and names the delegators", async () => {
    const result = await recordedResult();
    render(<DelegationChangeList changes={result.report.largestChanges} />);
    const largest = result.report.largestChanges[0];
    expect(screen.getByRole("link", { name: largest.txId }).getAttribute("href")).toBe(largest.txUrl);
    expect(screen.getByText("0x1111000000000000000000000000000000000011")).toBeTruthy();
  });

  it("says plainly when no change was recorded", () => {
    render(<DelegationChangeList changes={[]} />);
    expect(screen.getByText(/No delegation change was recorded/)).toBeTruthy();
  });
});

describe("CoverageNotice", () => {
  it("states the scanned range, the proposals and what the report does not cover", async () => {
    const result = await recordedResult();
    render(<CoverageNotice report={result.report} />);
    const region = screen.getByRole("complementary", { name: "Evidence coverage" });
    expect(region.textContent).toContain("Blocks 900–2000");
    expect(region.textContent).toContain("does not reach the chain's start");
    expect(region.textContent).toMatch(/does not rank, score or recommend delegates/);
    expect(screen.getByRole("rowheader", { name: "1" })).toBeTruthy();
  });
});

describe("DelegateParticipation", () => {
  it("reads a governance and renders the evidence", async () => {
    const result = await recordedResult();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(result), { status: 200, headers: { "content-type": "application/json" } }));

    render(<DelegateParticipation />);
    expect(screen.getByText(/does not rank or recommend delegates/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Governance token address"), { target: { value: TOKEN } });
    fireEvent.change(screen.getByLabelText("Governor address"), { target: { value: GOVERNOR } });
    fireEvent.click(screen.getByRole("button", { name: "Read delegate participation" }));

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe("Report complete. 2 delegate(s) over 3 proposal(s)."),
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/insights/delegate-participation", expect.objectContaining({ method: "POST" }));
    expect(screen.getByRole("region", { name: "Delegates" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Voting power over time" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Largest delegation changes" })).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "Evidence coverage" })).toBeTruthy();
  });

  it("shows the unsupported-governor reason and the coverage instead of an empty report", async () => {
    const result = await recordedResult("unsupportedGovernor");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(result), { status: 422, headers: { "content-type": "application/json" } }),
    );

    render(<DelegateParticipation />);
    fireEvent.change(screen.getByLabelText("Governance token address"), { target: { value: TOKEN } });
    fireEvent.change(screen.getByLabelText("Governor address"), { target: { value: GOVERNOR } });
    fireEvent.click(screen.getByRole("button", { name: "Read delegate participation" }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/holds no contract code/));
    expect(screen.getByRole("complementary", { name: "Evidence coverage" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Delegates" })).toBeNull();
  });
});
