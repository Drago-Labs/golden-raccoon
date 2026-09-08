import { ethers } from "hardhat";
import { expect } from "chai";
import { getTestActors } from "../helpers/actors";
import {
  GoldRaccoonVault,
  GoldRaccoonPolicy,
  ReentrantToken,
  MaliciousReceiver,
} from "../../typechain-types";

describe("Reentrancy Security", () => {
  let vault: GoldRaccoonVault;
  let policy: GoldRaccoonPolicy;
  let reentrantToken: ReentrantToken;
  let maliciousReceiver: MaliciousReceiver;
  let actors: Awaited<ReturnType<typeof getTestActors>>;

  beforeEach(async () => {
    actors = await getTestActors();

    const PolicyFactory = await ethers.getContractFactory("GoldRaccoonPolicy");
    policy = await PolicyFactory.deploy();
    await policy.setAgent(actors.agent.address);
    await policy.setEmergencyAdmin(actors.emergencyAdmin.address);
    await policy.setLimits(ethers.MaxUint256, 10_000n, ethers.MaxUint256);

    const VaultFactory = await ethers.getContractFactory("GoldRaccoonVault");
    vault = await VaultFactory.deploy(
      await policy.getAddress(),
      actors.agent.address
    );

    const ReentrantTokenFactory = await ethers.getContractFactory("ReentrantToken");
    reentrantToken = await ReentrantTokenFactory.deploy();

    const MaliciousReceiverFactory = await ethers.getContractFactory("MaliciousReceiver");
    maliciousReceiver = await MaliciousReceiverFactory.deploy(
      await vault.getAddress(),
      await reentrantToken.getAddress()
    );
  });

  it("reentrancy: hostile token attempting reentrancy into vault.withdraw fails and cannot execute second effect", async () => {
    const user = actors.user1;
    const userAddr = user.address;
    const tokenAddr = await reentrantToken.getAddress();
    const vaultAddr = await vault.getAddress();
    const amount = ethers.parseEther("100");

    await reentrantToken.mint(userAddr, amount);
    await reentrantToken.connect(user).approve(vaultAddr, amount);
    await vault.connect(user).deposit(tokenAddr, amount);

    const block = await ethers.provider.getBlock("latest");
    const expiry = (block?.timestamp ?? 0) + 3600;

    const decisionHash = await policy
      .connect(actors.agent)
      .applyPolicy.staticCall(userAddr, amount, 500n, expiry);
    await policy
      .connect(actors.agent)
      .applyPolicy(userAddr, amount, 500n, expiry);

    const intentHash = await policy
      .connect(actors.agent)
      .createIntent.staticCall(decisionHash, tokenAddr, amount / 2n, expiry, 100n);
    await policy
      .connect(actors.agent)
      .createIntent(decisionHash, tokenAddr, amount / 2n, expiry, 100n);

    // Prepare attack: reentrant token calls withdraw during transfer
    const attackCalldata = vault.interface.encodeFunctionData("withdraw", [
      tokenAddr,
      amount / 2n,
      userAddr,
      intentHash,
    ]);

    // Test case A: Token configured with revertIfFailed = true
    await reentrantToken.setReentrancyTarget(vaultAddr, attackCalldata, true, false, true);

    await expect(
      vault
        .connect(actors.agent)
        .withdraw(tokenAddr, amount / 2n, userAddr, intentHash)
    ).to.be.reverted;

    // Test case B: Token configured with revertIfFailed = false
    await reentrantToken.setReentrancyTarget(vaultAddr, attackCalldata, true, false, false);

    await vault
      .connect(actors.agent)
      .withdraw(tokenAddr, amount / 2n, userAddr, intentHash);

    // Attack was attempted but failed
    expect(await reentrantToken.attackCount()).to.equal(1n);
    expect(await reentrantToken.attackSuccess()).to.be.false;
  });

  it("reentrancy: hostile token attempting reentrancy into vault.deposit during transferFrom fails", async () => {
    const user = actors.user1;
    const userAddr = user.address;
    const tokenAddr = await reentrantToken.getAddress();
    const vaultAddr = await vault.getAddress();
    const amount = ethers.parseEther("100");

    await reentrantToken.mint(userAddr, amount * 2n);
    await reentrantToken.connect(user).approve(vaultAddr, amount * 2n);

    const attackDepositCalldata = vault.interface.encodeFunctionData("deposit", [
      tokenAddr,
      amount / 2n,
    ]);

    // Test with revertIfFailed = true
    await reentrantToken.setReentrancyTarget(vaultAddr, attackDepositCalldata, false, true, true);

    await expect(
      vault.connect(user).deposit(tokenAddr, amount)
    ).to.be.reverted;
  });

  it("reentrancy: malicious receiver contract cannot reenter withdraw to achieve double withdrawal", async () => {
    const receiverAddr = await maliciousReceiver.getAddress();
    const tokenAddr = await reentrantToken.getAddress();
    const vaultAddr = await vault.getAddress();
    const amount = ethers.parseEther("50");

    const user = actors.user1;
    await reentrantToken.mint(user.address, amount);
    await reentrantToken.connect(user).approve(vaultAddr, amount);
    await vault.connect(user).deposit(tokenAddr, amount);

    const block = await ethers.provider.getBlock("latest");
    const expiry = (block?.timestamp ?? 0) + 3600;

    const decisionHash = await policy
      .connect(actors.agent)
      .applyPolicy.staticCall(user.address, amount, 500n, expiry);
    await policy
      .connect(actors.agent)
      .applyPolicy(user.address, amount, 500n, expiry);

    const intentHash = await policy
      .connect(actors.agent)
      .createIntent.staticCall(decisionHash, tokenAddr, amount, expiry, 100n);
    await policy
      .connect(actors.agent)
      .createIntent(decisionHash, tokenAddr, amount, expiry, 100n);

    // Configure malicious receiver to reenter with the same intent
    await maliciousReceiver.setAttackParams(amount, intentHash, true);

    // Normal withdrawal to user succeeds
    await vault
      .connect(actors.agent)
      .withdraw(tokenAddr, amount, user.address, intentHash);

    // Malicious receiver tries to call withdraw with consumed intent
    await maliciousReceiver.triggerAttack();
    expect(await maliciousReceiver.attackCount()).to.equal(1n);

    // Intent was consumed, so attack failed
    expect(await vault.consumedIntents(intentHash)).to.be.true;
    expect(await vault.userBalance(user.address, tokenAddr)).to.equal(0n);
  });
});
