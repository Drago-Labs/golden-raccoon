import { ethers } from "hardhat";
import { expect } from "chai";
import { getTestActors } from "../helpers/actors";
import { generateAuditActions } from "../helpers/actions";
import { AuditHandler } from "../helpers/handlers";
import { GoldenRaccoonAudit } from "../../typechain-types";

describe("Audit Invariants", () => {
  let audit: GoldenRaccoonAudit;
  let actors: Awaited<ReturnType<typeof getTestActors>>;

  beforeEach(async () => {
    actors = await getTestActors();

    const AuditFactory = await ethers.getContractFactory("GoldenRaccoonAudit");
    audit = await AuditFactory.deploy();
  });

  it("invariant: non-custodial balance remains zero across all actions", async () => {
    const auditAddr = await audit.getAddress();
    const balBefore = await ethers.provider.getBalance(auditAddr);
    expect(balBefore).to.equal(0n);

    // Direct transfers must revert
    await expect(
      actors.owner.sendTransaction({
        to: auditAddr,
        value: ethers.parseEther("1"),
      })
    ).to.be.reverted;

    const balAfter = await ethers.provider.getBalance(auditAddr);
    expect(balAfter).to.equal(0n);
  });

  it("invariant: intent uniqueness holds under randomized trace execution", async () => {
    const users = [actors.user1, actors.user2];
    const agents = [actors.agent];
    const handler = new AuditHandler(audit, users, agents);

    const trace = generateAuditActions(99, 40, users.length);
    for (const step of trace.steps) {
      await handler.executeAction(step);
      await handler.verifyInvariants();
    }
  });

  it("deliberate fault: removing intentUsed check allows intent ID reuse", async () => {
    const user = actors.user1;
    const agent = actors.agent;
    const policyHash = ethers.keccak256(ethers.toUtf8Bytes("user-policy-test"));

    await audit.connect(user).setPolicy(policyHash);

    const block = await ethers.provider.getBlock("latest");
    const now = BigInt(block?.timestamp ?? 0);
    const agentExpiry = now + 3600n;
    await audit.connect(user).authorizeAgent(agent.address, policyHash, agentExpiry);

    const intentId = ethers.keccak256(ethers.toUtf8Bytes("unique-intent-1"));
    const decisionId = ethers.keccak256(ethers.toUtf8Bytes("dec-1"));
    const intentHash = ethers.keccak256(ethers.toUtf8Bytes("inthash-1"));
    const intentExpiry = now + 1800n;

    // First recording succeeds
    await audit
      .connect(agent)
      .recordIntent(user.address, policyHash, intentId, decisionId, intentHash, intentExpiry);

    expect(await audit.intentUsed(user.address, intentId)).to.be.true;

    // Second recording must revert with IntentReplayed
    await expect(
      audit
        .connect(agent)
        .recordIntent(user.address, policyHash, intentId, decisionId, intentHash, intentExpiry)
    ).to.be.revertedWithCustomError(audit, "IntentReplayed");
  });
});
