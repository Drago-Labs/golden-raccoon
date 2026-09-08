import { ethers } from "hardhat";
import { expect } from "chai";
import { getTestActors } from "../helpers/actors";
import { DeterministicRandom } from "../helpers/actions";
import { GoldRaccoonPolicy, MockERC20 } from "../../typechain-types";

describe("Policy Limits Fuzzing", () => {
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
  });

  it("fuzz: slippage bounds enforced across entire range [0, 10_000]", async () => {
    const rng = new DeterministicRandom(3003);

    for (let i = 0; i < 20; i++) {
      const validSlippage = BigInt(rng.nextInt(0, 10_000));
      await policy.setLimits(ethers.parseEther("1000"), validSlippage, ethers.parseEther("10000"));
      expect(await policy.maxSlippageBps()).to.equal(validSlippage);

      const invalidSlippage = BigInt(rng.nextInt(10_001, 100_000));
      await expect(
        policy.setLimits(ethers.parseEther("1000"), invalidSlippage, ethers.parseEther("10000"))
      ).to.be.revertedWith("Policy: slippage too high");
    }
  });

  it("fuzz: intents violating policy limits or decision limits revert consistently", async () => {
    const rng = new DeterministicRandom(4004);
    const tokenAddr = await token.getAddress();
    const user = actors.user1;
    const userAddr = user.address;

    for (let i = 0; i < 15; i++) {
      const globalMaxTx = rng.nextBigInt(100n * 10n ** 18n, 500n * 10n ** 18n);
      const globalMaxSlippage = BigInt(rng.nextInt(200, 1000));
      const globalMaxDaily = rng.nextBigInt(1000n * 10n ** 18n, 5000n * 10n ** 18n);

      await policy.setLimits(globalMaxTx, globalMaxSlippage, globalMaxDaily);

      const decisionMaxTx = rng.nextBigInt(50n * 10n ** 18n, globalMaxTx);
      const decisionSlippage = BigInt(rng.nextInt(100, Number(globalMaxSlippage)));

      const block = await ethers.provider.getBlock("latest");
      const expiry = (block?.timestamp ?? 0) + 7200 + i * 100;

      const decisionHash = await policy
        .connect(actors.agent)
        .applyPolicy.staticCall(userAddr, decisionMaxTx, decisionSlippage, expiry);
      await policy
        .connect(actors.agent)
        .applyPolicy(userAddr, decisionMaxTx, decisionSlippage, expiry);

      // Intent exceeding decision maxTx must revert
      const excessAmount = decisionMaxTx + rng.nextBigInt(1n, 10n * 10n ** 18n);
      await expect(
        policy
          .connect(actors.agent)
          .createIntent(decisionHash, tokenAddr, excessAmount, expiry - 10, decisionSlippage)
      ).to.be.revertedWith("Policy: exceeds tx limit");

      // Intent exceeding decision slippage must revert
      const excessSlippage = decisionSlippage + BigInt(rng.nextInt(1, 100));
      if (excessSlippage <= globalMaxSlippage) {
        await expect(
          policy
            .connect(actors.agent)
            .createIntent(decisionHash, tokenAddr, decisionMaxTx / 2n, expiry - 10, excessSlippage)
        ).to.be.revertedWith("Policy: slippage exceeds policy limit");
      }
    }
  });
});
