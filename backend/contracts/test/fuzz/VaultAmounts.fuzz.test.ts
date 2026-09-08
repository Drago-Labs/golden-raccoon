import { ethers } from "hardhat";
import { expect } from "chai";
import { getTestActors } from "../helpers/actors";
import { DeterministicRandom } from "../helpers/actions";
import { GoldRaccoonVault, GoldRaccoonPolicy, MockERC20 } from "../../typechain-types";

describe("Vault Amounts Fuzzing", () => {
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
    await policy.setEmergencyAdmin(actors.emergencyAdmin.address);
    await policy.setLimits(
      ethers.MaxUint256,
      10_000n,
      ethers.MaxUint256
    );

    const VaultFactory = await ethers.getContractFactory("GoldRaccoonVault");
    vault = await VaultFactory.deploy(
      await policy.getAddress(),
      actors.agent.address
    );
  });

  it("fuzz: deposit and withdrawal across wide value spectrum maintains strict accounting", async () => {
    const rng = new DeterministicRandom(1001);
    const tokenAddr = await token.getAddress();
    const vaultAddr = await vault.getAddress();
    const user = actors.user1;
    const userAddr = user.address;

    let cumulativeDeposited = 0n;
    let cumulativeWithdrawn = 0n;

    // Fuzz 30 iterations of random deposit/withdraw amounts
    for (let i = 0; i < 30; i++) {
      // Pick amounts from 1 wei to 1,000,000 ether
      const depositAmount = rng.nextBigInt(1n, 100_000n * 10n ** 18n);

      await token.mint(userAddr, depositAmount);
      await token.connect(user).approve(vaultAddr, depositAmount);
      await vault.connect(user).deposit(tokenAddr, depositAmount);

      cumulativeDeposited += depositAmount;
      const onChainBalAfterDeposit = await vault.userBalance(userAddr, tokenAddr);
      expect(onChainBalAfterDeposit).to.equal(cumulativeDeposited - cumulativeWithdrawn);

      // Random withdraw amount up to current balance
      const currentBal = onChainBalAfterDeposit;
      if (currentBal > 0n) {
        const withdrawAmount = rng.nextBigInt(1n, currentBal);

        const block = await ethers.provider.getBlock("latest");
        const expiry = (block?.timestamp ?? 0) + 3600 + i * 10;

        const decisionHash = await policy
          .connect(actors.agent)
          .applyPolicy.staticCall(userAddr, withdrawAmount, 500n, expiry);
        await policy
          .connect(actors.agent)
          .applyPolicy(userAddr, withdrawAmount, 500n, expiry);

        const intentHash = await policy
          .connect(actors.agent)
          .createIntent.staticCall(decisionHash, tokenAddr, withdrawAmount, expiry, 100n);
        await policy
          .connect(actors.agent)
          .createIntent(decisionHash, tokenAddr, withdrawAmount, expiry, 100n);

        await vault
          .connect(actors.agent)
          .withdraw(tokenAddr, withdrawAmount, userAddr, intentHash);

        cumulativeWithdrawn += withdrawAmount;
        const onChainBalAfterWithdraw = await vault.userBalance(userAddr, tokenAddr);
        expect(onChainBalAfterWithdraw).to.equal(cumulativeDeposited - cumulativeWithdrawn);
      }
    }

    const finalVaultBal = await token.balanceOf(vaultAddr);
    expect(finalVaultBal).to.equal(cumulativeDeposited - cumulativeWithdrawn);
  });

  it("fuzz: withdrawals exceeding tracked balance revert unconditionally", async () => {
    const rng = new DeterministicRandom(2002);
    const tokenAddr = await token.getAddress();
    const vaultAddr = await vault.getAddress();
    const user = actors.user2;
    const userAddr = user.address;

    const depositAmount = rng.nextBigInt(10n * 10n ** 18n, 50n * 10n ** 18n);
    await token.mint(userAddr, depositAmount);
    await token.connect(user).approve(vaultAddr, depositAmount);
    await vault.connect(user).deposit(tokenAddr, depositAmount);

    // Attempt to withdraw depositAmount + extra
    const excessAmount = depositAmount + rng.nextBigInt(1n, 10n * 10n ** 18n);

    const block = await ethers.provider.getBlock("latest");
    const expiry = (block?.timestamp ?? 0) + 3600;

    const decisionHash = await policy
      .connect(actors.agent)
      .applyPolicy.staticCall(userAddr, excessAmount, 500n, expiry);
    await policy
      .connect(actors.agent)
      .applyPolicy(userAddr, excessAmount, 500n, expiry);

    const intentHash = await policy
      .connect(actors.agent)
      .createIntent.staticCall(decisionHash, tokenAddr, excessAmount, expiry, 100n);
    await policy
      .connect(actors.agent)
      .createIntent(decisionHash, tokenAddr, excessAmount, expiry, 100n);

    await expect(
      vault.connect(actors.agent).withdraw(tokenAddr, excessAmount, userAddr, intentHash)
    ).to.be.revertedWith("Vault: insufficient balance");
  });
});
