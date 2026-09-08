import { ethers } from "hardhat";
import { expect } from "chai";
import { getTestActors, distributeTokens } from "../helpers/actors";
import { generateVaultActions, ActionTrace, VaultAction } from "../helpers/actions";
import { VaultHandler } from "../helpers/handlers";
import {
  GoldRaccoonVault,
  GoldRaccoonPolicy,
  MockERC20,
} from "../../typechain-types";

describe("Vault Invariants", () => {
  let vault: GoldRaccoonVault;
  let policy: GoldRaccoonPolicy;
  let token: MockERC20;
  let actors: Awaited<ReturnType<typeof getTestActors>>;

  beforeEach(async () => {
    actors = await getTestActors();

    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    token = await MockERC20Factory.deploy();

    const PolicyFactory = await ethers.getContractFactory("GoldRaccoonPolicy");
    policy = await PolicyFactory.deploy();

    await policy.setAgent(actors.agent.address);
    await policy.setLimits(
      ethers.parseEther("1000000"),
      1000n,
      ethers.parseEther("1000000")
    );

    const VaultFactory = await ethers.getContractFactory("GoldRaccoonVault");
    vault = await VaultFactory.deploy(
      await policy.getAddress(),
      actors.agent.address
    );
  });

  it("invariant: vault solvency holds under all randomized deposit and withdrawal sequences", async () => {
    const users = [actors.user1, actors.user2, actors.user3];
    const handler = new VaultHandler(vault, policy, token, actors.agent, users);
    const trace: ActionTrace<VaultAction> = generateVaultActions(42, 40, users.length);

    for (const step of trace.steps) {
      await handler.executeAction(step);
      await handler.verifyInvariants();
    }

    const tokenAddr = await token.getAddress();
    const vaultAddr = await vault.getAddress();
    const totalVaultBal = await token.balanceOf(vaultAddr);

    let sumBalances = 0n;
    for (const user of users) {
      sumBalances += await vault.userBalance(user.address, tokenAddr);
    }

    expect(totalVaultBal).to.equal(sumBalances);
    expect(totalVaultBal).to.equal(handler.ghostTotalDeposited);
  });

  it("invariant: deterministic execution under fixed seed reproduces identical state", async () => {
    const users = [actors.user1, actors.user2];
    const trace = generateVaultActions(1337, 20, users.length);

    const handler1 = new VaultHandler(vault, policy, token, actors.agent, users);
    for (const step of trace.steps) {
      await handler1.executeAction(step);
    }
    const state1 = handler1.ghostTotalDeposited;

    // Reset and replay identical trace
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    const token2 = await MockERC20Factory.deploy();
    const PolicyFactory = await ethers.getContractFactory("GoldRaccoonPolicy");
    const policy2 = await PolicyFactory.deploy();
    await policy2.setAgent(actors.agent.address);
    await policy2.setLimits(
      ethers.parseEther("1000000"),
      1000n,
      ethers.parseEther("1000000")
    );
    const VaultFactory = await ethers.getContractFactory("GoldRaccoonVault");
    const vault2 = await VaultFactory.deploy(
      await policy2.getAddress(),
      actors.agent.address
    );

    const handler2 = new VaultHandler(vault2, policy2, token2, actors.agent, users);
    for (const step of trace.steps) {
      await handler2.executeAction(step);
    }
    const state2 = handler2.ghostTotalDeposited;

    expect(state1).to.equal(state2);
  });

  it("deliberate fault: removing consumed intent guard causes invariant violation", async () => {
    const user = actors.user1;
    const userAddr = user.address;
    const tokenAddr = await token.getAddress();
    const amount = ethers.parseEther("10");

    await token.mint(userAddr, amount);
    await token.connect(user).approve(await vault.getAddress(), amount);
    await vault.connect(user).deposit(tokenAddr, amount);

    const block = await ethers.provider.getBlock("latest");
    const expiry = (block?.timestamp ?? 0) + 3600;

    const decisionHash = await policy
      .connect(actors.agent)
      .applyPolicy.staticCall(userAddr, amount * 2n, 500n, expiry);
    await policy
      .connect(actors.agent)
      .applyPolicy(userAddr, amount * 2n, 500n, expiry);

    const intentHash = await policy
      .connect(actors.agent)
      .createIntent.staticCall(decisionHash, tokenAddr, amount, expiry, 100n);
    await policy
      .connect(actors.agent)
      .createIntent(decisionHash, tokenAddr, amount, expiry, 100n);

    // First withdrawal succeeds
    await vault
      .connect(actors.agent)
      .withdraw(tokenAddr, amount, userAddr, intentHash);

    // Second withdrawal with same intent MUST revert; if guard were removed it would fail solvency
    await expect(
      vault
        .connect(actors.agent)
        .withdraw(tokenAddr, amount, userAddr, intentHash)
    ).to.be.revertedWith("Vault: intent consumed");
  });
});
