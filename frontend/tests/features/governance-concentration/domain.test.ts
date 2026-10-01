import { describe, expect, it } from "vitest";
import { summarizeGovernance, type VoteEvent } from "@/server/research/governance-concentration/service";

const votes: VoteEvent[] = [
  { proposalId: "1", voter: "alice", support: "for", weight: 60, tx: "0x1", logIndex: 1 },
  { proposalId: "1", voter: "bob", support: "for", weight: 30, tx: "0x2", logIndex: 1 },
  { proposalId: "1", voter: "cara", support: "against", weight: 10, tx: "0x3", logIndex: 1 },
];

describe("governance concentration", () => {
  it("matches the hand-computed fixture and drops duplicate vote events", () => {
    const report = summarizeGovernance({
      variant: "oz-governor",
      governor: "0x1111111111111111111111111111111111111111",
      proposals: [{
        id: "1",
        state: "executed",
        quorum: 50,
        executed: true,
        calldata: "0xa9059cbb",
        abi: [{ selector: "0xa9059cbb", name: "transfer" }],
      }],
      votePages: [votes, [votes[0]]],
    });
    expect(report.status).toBe("ok");
    if (report.status !== "ok") return;
    expect(report.proposals[0].split).toEqual({ for: 90, against: 10, abstain: 0 });
    expect(report.proposals[0].quorumMargin).toBe(40);
    expect(report.proposals[0].nakamoto).toBe(1);
    expect(report.proposals[0].topVoterShare).toBe(1);
    expect(report.proposals[0].call).toEqual({ form: "decoded", name: "transfer", calldata: "0xa9059cbb" });
  });

  it("returns unsupported instead of an empty success", () => {
    const report = summarizeGovernance({
      variant: "snapshot",
      governor: "0x1111111111111111111111111111111111111111",
      proposals: [],
      votePages: [],
    });
    expect(report.status).toBe("unsupported");
    expect(report.proposals).toEqual([]);
  });

  it("keeps unknown calldata raw", () => {
    const report = summarizeGovernance({
      variant: "compound-bravo",
      governor: "0x1111111111111111111111111111111111111111",
      proposals: [{ id: "9", state: "executed", quorum: 1, executed: true, calldata: "0xdeadbeef" }],
      votePages: [[{ proposalId: "9", voter: "a", support: "for", weight: 2, tx: "0xa", logIndex: 0 }]],
    });
    if (report.status !== "ok") throw new Error("expected ok");
    expect(report.proposals[0].call).toEqual({ form: "raw", calldata: "0xdeadbeef" });
  });
});
