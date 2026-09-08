import { ethers } from "hardhat";
import { expect } from "chai";
import { getTestActors } from "../helpers/actors";
import {
  GoldRaccoonPolicy,
  GoldRaccoonPolicyV2,
  GoldRaccoonVault,
  GoldenRaccoonAudit,
  MockERC20,
} from "../../typechain-types";

describe("Access Control Security", () => {
  let policy: GoldRaccoonPolicy;
  let policyV2: GoldRaccoonPolicyV2;
  let vault: GoldRaccoonVault;
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

    const VaultFactory = await ethers.getContractFactory("GoldRaccoonVault");
    vault = await VaultFactory.deploy(
      await policy.getAddress(),
      actors.agent.address
    );

    const PolicyV2Factory = await ethers.getContractFactory("GoldRaccoonPolicyV2");
    policyV2 = await PolicyV2Factory.deploy();

    const AuditFactory = await ethers.getContractFactory("GoldenRaccoonAudit");
    audit = await AuditFactory.deploy();
  });

  describe("GoldRaccoonPolicy Owner Operations", () => {
    it("rejects non-owner from transferring ownership", async () => {
      await expect(
        policy.connect(actors.attacker).transferOwnership(actors.attacker.address)
      ).to.be.revertedWith("Policy: not owner");
    });

    it("rejects non-owner from setting emergency admin", async () => {
      await expect(
        policy.connect(actors.attacker).setEmergencyAdmin(actors.attacker.address)
      ).to.be.revertedWith("Policy: not owner");
    });

    it("rejects non-owner from setting agent", async () => {
      await expect(
        policy.connect(actors.attacker).setAgent(actors.attacker.address)
      ).to.be.revertedWith("Policy: not owner");
    });

    it("rejects non-owner from setting limits", async () => {
      await expect(
        policy.connect(actors.attacker).setLimits(100n, 100n, 100n)
      ).to.be.revertedWith("Policy: not owner");
    });

    it("rejects non-owner from allowing or blocking assets", async () => {
      const tokenAddr = await token.getAddress();
      await expect(
        policy.connect(actors.attacker).allowAsset(tokenAddr)
      ).to.be.revertedWith("Policy: not owner");
      await expect(
        policy.connect(actors.attacker).blockAsset(tokenAddr, true)
      ).to.be.revertedWith("Policy: not owner");
    });
  });

  describe("GoldRaccoonPolicy Emergency Admin Operations", () => {
    it("rejects non-admin from pausing and unpausing", async () => {
      await expect(
        policy.connect(actors.attacker).pause()
      ).to.be.revertedWith("Policy: not owner or emergency");
      await expect(
        policy.connect(actors.attacker).unpause()
      ).to.be.revertedWith("Policy: not owner or emergency");
    });

    it("rejects non-admin from revoking arbitrary intents", async () => {
      const dummyHash = ethers.keccak256(ethers.toUtf8Bytes("dummy"));
      await expect(
        policy.connect(actors.attacker).revokeIntent(dummyHash)
      ).to.be.revertedWith("Policy: not owner or emergency");
    });
  });

  describe("GoldRaccoonPolicy Agent Operations", () => {
    it("rejects non-agent from applying policy", async () => {
      await expect(
        policy
          .connect(actors.attacker)
          .applyPolicy(actors.user1.address, 1000n, 100n, 9999999999)
      ).to.be.revertedWith("Policy: not agent");
    });

    it("rejects non-agent from creating intent", async () => {
      const dummyHash = ethers.keccak256(ethers.toUtf8Bytes("dummy"));
      await expect(
        policy
          .connect(actors.attacker)
          .createIntent(dummyHash, await token.getAddress(), 1000n, 9999999999, 100n)
      ).to.be.revertedWith("Policy: not agent");
    });

    it("rejects non-agent from executing intent", async () => {
      const dummyHash = ethers.keccak256(ethers.toUtf8Bytes("dummy"));
      await expect(
        policy.connect(actors.attacker).executeIntent(dummyHash)
      ).to.be.revertedWith("Policy: not agent");
    });
  });

  describe("GoldRaccoonVault Operations", () => {
    it("rejects non-agent from withdrawing", async () => {
      const dummyHash = ethers.keccak256(ethers.toUtf8Bytes("dummy"));
      await expect(
        vault
          .connect(actors.attacker)
          .withdraw(await token.getAddress(), 1000n, actors.attacker.address, dummyHash)
      ).to.be.revertedWith("Vault: not agent");
    });
  });

  describe("GoldRaccoonPolicyV2 Operations", () => {
    it("rejects non-owner from setting timelock", async () => {
      await expect(
        policyV2.connect(actors.attacker).setTimelock(actors.attacker.address)
      ).to.be.revertedWith("Policy: not owner");
    });
  });

  describe("GoldenRaccoonAudit Operations", () => {
    it("rejects unauthorized caller from logging decisions", async () => {
      const dummyHash = ethers.keccak256(ethers.toUtf8Bytes("dummy"));
      await expect(
        audit
          .connect(actors.attacker)
          .logDecision(actors.user1.address, dummyHash, dummyHash, dummyHash, 50)
      ).to.be.revertedWithCustomError(audit, "NotAuthorized");
    });

    it("rejects unauthorized caller from recording intents", async () => {
      const dummyHash = ethers.keccak256(ethers.toUtf8Bytes("dummy"));
      await expect(
        audit
          .connect(actors.attacker)
          .recordIntent(actors.user1.address, dummyHash, dummyHash, dummyHash, dummyHash, 9999999999)
      ).to.be.revertedWithCustomError(audit, "NotAuthorized");
    });
  });
});
