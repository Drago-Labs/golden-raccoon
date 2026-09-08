import { ethers } from "hardhat";
import { expect } from "chai";
import { getTestActors } from "../helpers/actors";
import {
  GoldRaccoonPolicy,
  GoldenRaccoonAudit,
  MockERC20,
} from "../../typechain-types";

describe("Pause Security", () => {
  let policy: GoldRaccoonPolicy;
  let audit: GoldenRaccoonAudit;
  let token: MockERC20;
  let actors: Awaited<ReturnType<typeof getTestActors>>;

  beforeEach(async () => {
    actors = await getTestActors();

    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    token = await MockERC20Factory.deploy();

    const PolicyFactory = await ethers.getContractFactory("GoldRaccoonPolicy");
    policy = await PolicyFactory.deploy();
    await policy.setAgent(actors.agent.address);
    await policy.setEmergencyAdmin(actors.emergencyAdmin.address);

    const AuditFactory = await ethers.getContractFactory("GoldenRaccoonAudit");
    audit = await AuditFactory.deploy();
  });

  describe("GoldRaccoonPolicy Pause Behavior", () => {
    it("emergency pause blocks applyPolicy, createIntent, and executeIntent", async () => {
      await policy.connect(actors.emergencyAdmin).pause();
      expect(await policy.paused()).to.be.true;

      const dummyHash = ethers.keccak256(ethers.toUtf8Bytes("dummy"));
      const block = await ethers.provider.getBlock("latest");
      const expiry = (block?.timestamp ?? 0) + 3600;

      await expect(
        policy
          .connect(actors.agent)
          .applyPolicy(actors.user1.address, 1000n, 100n, expiry)
      ).to.be.revertedWith("Policy: paused");

      await expect(
        policy
          .connect(actors.agent)
          .createIntent(dummyHash, await token.getAddress(), 1000n, expiry, 100n)
      ).to.be.revertedWith("Policy: paused");

      await expect(
        policy.connect(actors.agent).executeIntent(dummyHash)
      ).to.be.revertedWith("Policy: paused");
    });

    it("revoking policies remains operational even during emergency pause (emergency exit invariant)", async () => {
      const block = await ethers.provider.getBlock("latest");
      const expiry = (block?.timestamp ?? 0) + 3600;

      const decisionHash = await policy
        .connect(actors.agent)
        .applyPolicy.staticCall(actors.user1.address, 1000n, 100n, expiry);
      await policy
        .connect(actors.agent)
        .applyPolicy(actors.user1.address, 1000n, 100n, expiry);

      // Now emergency pause
      await policy.connect(actors.emergencyAdmin).pause();
      expect(await policy.paused()).to.be.true;

      // User must still be able to revoke their policy
      await policy.connect(actors.user1).revokePolicy(decisionHash);
      const decision = await policy.policyDecisions(decisionHash);
      expect(decision.revoked).to.be.true;
    });

    it("unpause restores full functionality", async () => {
      await policy.connect(actors.emergencyAdmin).pause();
      expect(await policy.paused()).to.be.true;

      await policy.connect(actors.owner).unpause();
      expect(await policy.paused()).to.be.false;

      const block = await ethers.provider.getBlock("latest");
      const expiry = (block?.timestamp ?? 0) + 3600;

      await expect(
        policy
          .connect(actors.agent)
          .applyPolicy(actors.user1.address, 1000n, 100n, expiry)
      ).to.not.be.reverted;
    });
  });

  describe("GoldenRaccoonAudit Pause Behavior", () => {
    it("pause scopes to user and blocks agent logging until unpaused", async () => {
      const user = actors.user1;
      const agent = actors.agent;
      const policyHash = ethers.keccak256(ethers.toUtf8Bytes("policy-hash"));

      await audit.connect(user).setPolicy(policyHash);

      const block = await ethers.provider.getBlock("latest");
      const now = BigInt(block?.timestamp ?? 0);
      await audit.connect(user).authorizeAgent(agent.address, policyHash, now + 3600n);

      // User pauses
      await audit.connect(user).setPaused(true);
      expect(await audit.paused(user.address)).to.be.true;

      const decisionId = ethers.keccak256(ethers.toUtf8Bytes("dec-1"));
      const decisionHash = ethers.keccak256(ethers.toUtf8Bytes("dechash-1"));

      await expect(
        audit
          .connect(agent)
          .logDecision(user.address, policyHash, decisionId, decisionHash, 20)
      ).to.be.revertedWithCustomError(audit, "ContractPaused");

      // User unpauses
      await audit.connect(user).setPaused(false);
      expect(await audit.paused(user.address)).to.be.false;

      await expect(
        audit
          .connect(agent)
          .logDecision(user.address, policyHash, decisionId, decisionHash, 20)
      ).to.not.be.reverted;
    });
  });
});
