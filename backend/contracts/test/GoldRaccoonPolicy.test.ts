import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("GoldRaccoonPolicy", function () {
  async function deployFixture() {
    const [owner, emergency, agent, user, token, blockedToken] = await ethers.getSigners();
    const Policy = await ethers.getContractFactory("GoldRaccoonPolicy");
    const policy = await Policy.deploy();
    await policy.waitForDeployment();

    await policy.setEmergencyAdmin(emergency.address);
    await policy.setAgent(agent.address);
    await policy.setLimits(ethers.parseEther("100"), 100, ethers.parseEther("50"));

    await policy.allowAsset(token.address);

    return { policy, owner, emergency, agent, user, token, blockedToken };
  }

  describe("Deployment", function () {
    it("should set the owner and version", async function () {
      const { policy, owner } = await loadFixture(deployFixture);
      expect(await policy.owner()).to.equal(owner.address);
      expect(await policy.getVersion()).to.equal("1.0.0");
    });
  });

  describe("Authorization", function () {
    it("should reject non-owner from setting agent", async function () {
      const { policy, user } = await loadFixture(deployFixture);
      await expect(policy.connect(user).setAgent(user.address)).to.be.revertedWith("Policy: not owner");
    });

    it("should reject non-agent from applying policy", async function () {
      const { policy, user } = await loadFixture(deployFixture);
      const expiry = await time.latest() + 3600;
      await expect(policy.connect(user).applyPolicy(user.address, ethers.parseEther("5"), 50, expiry)).to.be.revertedWith("Policy: not agent");
    });
  });

  describe("Limits", function () {
    it("should reject over-limit intent", async function () {
      const { policy, agent, user, token } = await loadFixture(deployFixture);

      const expiry = await time.latest() + 3600;
      const decision = await policy.connect(agent).applyPolicy.staticCall(user.address, ethers.parseEther("5"), 50, expiry);
      await policy.connect(agent).applyPolicy(user.address, ethers.parseEther("5"), 50, expiry);

      const intentExpiry = await time.latest() + 1800;
      await expect(policy.connect(agent).createIntent(decision, token.address, ethers.parseEther("20"), intentExpiry, 50))
        .to.be.revertedWith("Policy: exceeds tx limit");
    });

    it("should reject over-slippage intent", async function () {
      const { policy, agent, user, token } = await loadFixture(deployFixture);

      const expiry = await time.latest() + 3600;
      const decision = await policy.connect(agent).applyPolicy.staticCall(user.address, ethers.parseEther("10"), 100, expiry);
      await policy.connect(agent).applyPolicy(user.address, ethers.parseEther("10"), 100, expiry);

      const intentExpiry = await time.latest() + 1800;
      await expect(policy.connect(agent).createIntent(decision, token.address, ethers.parseEther("1"), intentExpiry, 200))
        .to.be.revertedWith("Policy: slippage exceeds limit");
    });

    it("should reject over-daily-spend", async function () {
      const { policy, agent, user, token } = await loadFixture(deployFixture);

      const expiry = await time.latest() + 3600;
      const decision = await policy.connect(agent).applyPolicy.staticCall(user.address, ethers.parseEther("100"), 100, expiry);
      await policy.connect(agent).applyPolicy(user.address, ethers.parseEther("100"), 100, expiry);

      const intentExpiry = await time.latest() + 1800;
      await policy.connect(agent).createIntent(decision, token.address, ethers.parseEther("45"), intentExpiry, 50);

      const decision2 = await policy.connect(agent).applyPolicy.staticCall(user.address, ethers.parseEther("100"), 100, expiry);
      await policy.connect(agent).applyPolicy(user.address, ethers.parseEther("100"), 100, expiry);

      await expect(policy.connect(agent).createIntent(decision2, token.address, ethers.parseEther("45"), intentExpiry, 50))
        .to.be.revertedWith("Policy: daily limit");
    });
  });

  describe("Asset allow/block", function () {
    it("should reject blocked asset", async function () {
      const { policy, agent, user, blockedToken } = await loadFixture(deployFixture);

      await policy.blockAsset(blockedToken.address, true);

      const expiry = await time.latest() + 3600;
      const decision = await policy.connect(agent).applyPolicy.staticCall(user.address, ethers.parseEther("10"), 100, expiry);
      await policy.connect(agent).applyPolicy(user.address, ethers.parseEther("10"), 100, expiry);

      const intentExpiry = await time.latest() + 1800;
      await expect(policy.connect(agent).createIntent(decision, blockedToken.address, ethers.parseEther("1"), intentExpiry, 50))
        .to.be.revertedWith("Policy: asset blocked");
    });
  });

  describe("Expiry", function () {
    it("should reject expired policy", async function () {
      const { policy, agent, user } = await loadFixture(deployFixture);

      const pastExpiry = await time.latest() - 1;
      await expect(policy.connect(agent).applyPolicy(user.address, ethers.parseEther("5"), 50, pastExpiry))
        .to.be.revertedWith("Policy: expired");
    });

    it("should reject expired intent", async function () {
      const { policy, agent, user, token } = await loadFixture(deployFixture);

      const expiry = await time.latest() + 3600;
      const decision = await policy.connect(agent).applyPolicy.staticCall(user.address, ethers.parseEther("10"), 100, expiry);
      await policy.connect(agent).applyPolicy(user.address, ethers.parseEther("10"), 100, expiry);

      const pastExpiry = await time.latest() - 1;
      await expect(policy.connect(agent).createIntent(decision, token.address, ethers.parseEther("1"), pastExpiry, 50))
        .to.be.revertedWith("Policy: intent expired");
    });
  });

  describe("Nonce / Replay protection", function () {
    it("should reject re-executed intent", async function () {
      const { policy, agent, user, token } = await loadFixture(deployFixture);

      const expiry = await time.latest() + 3600;
      const decision = await policy.connect(agent).applyPolicy.staticCall(user.address, ethers.parseEther("10"), 100, expiry);
      await policy.connect(agent).applyPolicy(user.address, ethers.parseEther("10"), 100, expiry);

      const intentExpiry = await time.latest() + 1800;
      const intentHash = await policy.connect(agent).createIntent.staticCall(decision, token.address, ethers.parseEther("1"), intentExpiry, 50);
      await policy.connect(agent).createIntent(decision, token.address, ethers.parseEther("1"), intentExpiry, 50);

      await policy.connect(agent).executeIntent(intentHash);
      await expect(policy.connect(agent).executeIntent(intentHash)).to.be.revertedWith("Policy: already executed");
    });
  });

  describe("Pause", function () {
    it("should block actions while paused", async function () {
      const { policy, owner, agent, user } = await loadFixture(deployFixture);

      await policy.connect(owner).pause();

      const expiry = await time.latest() + 3600;
      await expect(policy.connect(agent).applyPolicy(user.address, ethers.parseEther("5"), 50, expiry))
        .to.be.revertedWith("Policy: paused");

      await policy.connect(owner).unpause();
    });

    it("should allow emergency admin to pause", async function () {
      const { policy, emergency, agent, user } = await loadFixture(deployFixture);

      await policy.connect(emergency).pause();

      const expiry = await time.latest() + 3600;
      await expect(policy.connect(agent).applyPolicy(user.address, ethers.parseEther("5"), 50, expiry))
        .to.be.revertedWith("Policy: paused");

      await policy.connect(emergency).unpause();
    });
  });

  describe("Revoke", function () {
    it("should block intent after policy revoke", async function () {
      const { policy, owner, agent, user, token } = await loadFixture(deployFixture);

      const expiry = await time.latest() + 3600;
      const decision = await policy.connect(agent).applyPolicy.staticCall(user.address, ethers.parseEther("10"), 100, expiry);
      await policy.connect(agent).applyPolicy(user.address, ethers.parseEther("10"), 100, expiry);

      await policy.revokePolicy(decision);

      const intentExpiry = await time.latest() + 1800;
      await expect(policy.connect(agent).createIntent(decision, token.address, ethers.parseEther("1"), intentExpiry, 50))
        .to.be.revertedWith("Policy: policy revoked");
    });

    it("should allow revoke even while paused", async function () {
      const { policy, owner, agent, user, token } = await loadFixture(deployFixture);

      const expiry = await time.latest() + 3600;
      const decision = await policy.connect(agent).applyPolicy.staticCall(user.address, ethers.parseEther("10"), 100, expiry);
      await policy.connect(agent).applyPolicy(user.address, ethers.parseEther("10"), 100, expiry);

      await policy.connect(owner).pause();
      await policy.revokePolicy(decision);
      await policy.connect(owner).unpause();

      const intentExpiry = await time.latest() + 1800;
      await expect(policy.connect(agent).createIntent(decision, token.address, ethers.parseEther("1"), intentExpiry, 50))
        .to.be.revertedWith("Policy: policy revoked");
    });
  });

  describe("Malicious agent", function () {
    it("should reject forged commitment", async function () {
      const { policy, agent, user, token } = await loadFixture(deployFixture);

      const expiry = await time.latest() + 3600;
      await policy.connect(agent).applyPolicy(user.address, ethers.parseEther("10"), 100, expiry);

      const forgedCommitment = ethers.keccak256(ethers.toUtf8Bytes("FORGED"));
      const intentExpiry = await time.latest() + 1800;
      await expect(policy.connect(agent).createIntent(forgedCommitment, token.address, ethers.parseEther("1"), intentExpiry, 50))
        .to.be.revertedWith("Policy: unknown policy");
    });
  });

  describe("Cross-domain replay", function () {
    it("should produce deterministic hashes for same inputs", async function () {
      const { policy, agent, user } = await loadFixture(deployFixture);

      const ts = await time.latest() + 3600;
      const dh1 = await policy.hashPolicyDecision(user.address, agent.address, ethers.parseEther("10"), 100, 1, ts);
      const dh2 = await policy.hashPolicyDecision(user.address, agent.address, ethers.parseEther("10"), 100, 1, ts);

      expect(dh1).to.equal(dh2);
    });
  });

  describe("Happy path", function () {
    it("should allow full policy -> intent -> execute flow", async function () {
      const { policy, agent, user, token } = await loadFixture(deployFixture);

      const expiry = await time.latest() + 3600;
      const decision = await policy.connect(agent).applyPolicy.staticCall(user.address, ethers.parseEther("10"), 100, expiry);
      await policy.connect(agent).applyPolicy(user.address, ethers.parseEther("10"), 100, expiry);

      const intentExpiry = await time.latest() + 1800;
      const intentHash = await policy.connect(agent).createIntent.staticCall(decision, token.address, ethers.parseEther("5"), intentExpiry, 50);
      await policy.connect(agent).createIntent(decision, token.address, ethers.parseEther("5"), intentExpiry, 50);

      await policy.connect(agent).executeIntent(intentHash);

      const intentData = await policy.intents(intentHash);
      expect(intentData.executed).to.equal(true);
    });
  });
});
