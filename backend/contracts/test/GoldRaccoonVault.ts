import { expect } from "chai";
import { ethers } from "hardhat";

describe("GoldRaccoonVault", function () {
  async function deployVault() {
    const [owner, agent, other] = await ethers.getSigners();
    const Vault = await ethers.getContractFactory("GoldRaccoonVault");
    const vault = await Vault.deploy();
    await vault.waitForDeployment();
    return { vault, owner, agent, other };
  }

  it("sets the deployer as owner", async function () {
    const { vault, owner } = await deployVault();
    expect(await vault.owner()).to.equal(owner.address);
  });

  it("allows the owner to set an agent and rules", async function () {
    const { vault, owner, agent } = await deployVault();

    await expect(vault.connect(owner).setAgent(agent.address))
      .to.emit(vault, "AgentApproved")
      .withArgs(owner.address, agent.address);

    await expect(vault.connect(owner).setRules(70, 25))
      .to.emit(vault, "RulesUpdated")
      .withArgs(owner.address, 70, 25);

    expect(await vault.agent()).to.equal(agent.address);
    expect(await vault.maxRiskScore()).to.equal(70n);
    expect(await vault.maxTradePercent()).to.equal(25n);
  });

  it("lets the approved agent log a decision", async function () {
    const { vault, owner, agent } = await deployVault();
    await vault.connect(owner).setAgent(agent.address);

    await expect(vault.connect(agent).logDecision("decision-hash", 42))
      .to.emit(vault, "DecisionLogged")
      .withArgs(owner.address, agent.address, "decision-hash", 42);
  });

  it("rejects unauthorized agent and rule updates", async function () {
    const { vault, agent, other } = await deployVault();

    await expect(vault.connect(other).setAgent(agent.address)).to.be.revertedWith("GoldRaccoon: not owner");
    await expect(vault.connect(other).setRules(50, 10)).to.be.revertedWith("GoldRaccoon: not owner");
    await expect(vault.connect(other).logDecision("decision-hash", 10)).to.be.revertedWith("GoldRaccoon: not agent");
  });

  it("revokes the approved agent", async function () {
    const { vault, owner, agent } = await deployVault();
    await vault.connect(owner).setAgent(agent.address);

    await expect(vault.connect(owner).revokeAgent())
      .to.emit(vault, "AgentRevoked")
      .withArgs(owner.address, agent.address);

    expect(await vault.agent()).to.equal(ethers.ZeroAddress);
  });
});
