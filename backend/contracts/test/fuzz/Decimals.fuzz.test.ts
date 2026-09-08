import { ethers } from "hardhat";
import { expect } from "chai";
import { getTestActors } from "../helpers/actors";
import { DeterministicRandom } from "../helpers/actions";
import {
  GoldRaccoonVault,
  GoldRaccoonPolicy,
  SixDecimalToken,
  MockERC20,
} from "../../typechain-types";

describe("Decimals Fuzzing", () => {
  let vault: GoldRaccoonVault;
  let policy: GoldRaccoonPolicy;
  let usdc6: SixDecimalToken;
  let token18: MockERC20;
  let actors: Awaited<ReturnType<typeof getTestActors>>;

  beforeEach(async () => {
    actors = await getTestActors();

    const SixDecFactory = await ethers.getContractFactory("SixDecimalToken");
    usdc6 = await SixDecFactory.deploy();

    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    token18 = await MockERC20Factory.deploy();

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

  it("fuzz: non-18 decimal token maintains strict accounting with zero rounding leakage", async () => {
    const rng = new DeterministicRandom(5005);
    const usdcAddr = await usdc6.getAddress();
    const vaultAddr = await vault.getAddress();
    const users = [actors.user1, actors.user2, actors.user3];

    const deposits = new Map<string, bigint>();
    const withdrawals = new Map<string, bigint>();

    for (const u of users) {
      deposits.set(u.address, 0n);
      withdrawals.set(u.address, 0n);
    }

    // 40 fuzz cycles covering 1 to 10,000,000 units of 6-decimal tokens
    for (let cycle = 0; cycle < 40; cycle++) {
      const user = rng.pick(users);
      const userAddr = user.address;

      // Smallest unit is 1 (0.000001 USDC), up to 500,000 USDC (500,000 * 10^6)
      const depAmount = rng.nextBigInt(1n, 500_000n * 10n ** 6n);

      await usdc6.mint(userAddr, depAmount);
      await usdc6.connect(user).approve(vaultAddr, depAmount);
      await vault.connect(user).deposit(usdcAddr, depAmount);

      deposits.set(userAddr, (deposits.get(userAddr) ?? 0n) + depAmount);

      // Attempt random withdrawal
      const currentNet = (deposits.get(userAddr) ?? 0n) - (withdrawals.get(userAddr) ?? 0n);
      if (currentNet > 0n && rng.next() < 0.7) {
        const withdrawAmount = rng.nextBigInt(1n, currentNet);

        const block = await ethers.provider.getBlock("latest");
        const expiry = (block?.timestamp ?? 0) + 3600 + cycle * 5;

        const decisionHash = await policy
          .connect(actors.agent)
          .applyPolicy.staticCall(userAddr, withdrawAmount, 500n, expiry);
        await policy
          .connect(actors.agent)
          .applyPolicy(userAddr, withdrawAmount, 500n, expiry);

        const intentHash = await policy
          .connect(actors.agent)
          .createIntent.staticCall(decisionHash, usdcAddr, withdrawAmount, expiry, 100n);
        await policy
          .connect(actors.agent)
          .createIntent(decisionHash, usdcAddr, withdrawAmount, expiry, 100n);

        await vault
          .connect(actors.agent)
          .withdraw(usdcAddr, withdrawAmount, userAddr, intentHash);

        withdrawals.set(userAddr, (withdrawals.get(userAddr) ?? 0n) + withdrawAmount);
      }

      // Assert invariant: no user can have balance greater than deposited minus withdrawn
      const onChainBalance = await vault.userBalance(userAddr, usdcAddr);
      const expectedBalance = (deposits.get(userAddr) ?? 0n) - (withdrawals.get(userAddr) ?? 0n);
      expect(onChainBalance).to.equal(expectedBalance);
    }

    // Solvency check across all users
    let totalDepositedNet = 0n;
    for (const u of users) {
      const net = (deposits.get(u.address) ?? 0n) - (withdrawals.get(u.address) ?? 0n);
      totalDepositedNet += net;
    }

    const vaultUsdcBal = await usdc6.balanceOf(vaultAddr);
    expect(vaultUsdcBal).to.equal(totalDepositedNet);
  });

  it("fuzz: withdrawing 1 unit more than deposited reverts across both 6-decimal and 18-decimal tokens", async () => {
    const user = actors.user1;
    const userAddr = user.address;
    const vaultAddr = await vault.getAddress();
    const usdcAddr = await usdc6.getAddress();

    const depositAmount = 1_000_000n; // Exactly 1 USDC
    await usdc6.mint(userAddr, depositAmount);
    await usdc6.connect(user).approve(vaultAddr, depositAmount);
    await vault.connect(user).deposit(usdcAddr, depositAmount);

    const block = await ethers.provider.getBlock("latest");
    const expiry = (block?.timestamp ?? 0) + 3600;

    // Try to withdraw 1 unit (0.000001) more than deposited
    const overWithdrawAmount = depositAmount + 1n;

    const decisionHash = await policy
      .connect(actors.agent)
      .applyPolicy.staticCall(userAddr, overWithdrawAmount, 500n, expiry);
    await policy
      .connect(actors.agent)
      .applyPolicy(userAddr, overWithdrawAmount, 500n, expiry);

    const intentHash = await policy
      .connect(actors.agent)
      .createIntent.staticCall(decisionHash, usdcAddr, overWithdrawAmount, expiry, 100n);
    await policy
      .connect(actors.agent)
      .createIntent(decisionHash, usdcAddr, overWithdrawAmount, expiry, 100n);

    await expect(
      vault
        .connect(actors.agent)
        .withdraw(usdcAddr, overWithdrawAmount, userAddr, intentHash)
    ).to.be.revertedWith("Vault: insufficient balance");
  });
});
