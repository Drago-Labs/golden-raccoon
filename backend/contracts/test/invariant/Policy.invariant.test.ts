import { ethers } from "hardhat";
import { expect } from "chai";
import { getTestActors } from "../helpers/actors";
import { generatePolicyActions } from "../helpers/actions";
import { PolicyHandler } from "../helpers/handlers";
import { GoldRaccoonPolicy, MockERC20 } from "../../typechain-types";

describe("Policy Invariants", () => {
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
      ethers.parseEther("1000"),
      500n,
      ethers.parseEther("5000")
    );
  });

  it("invariant: daily spend never exceeds maxDailySpend limit", async () => {
    const maxDaily = ethers.parseEther("5000");
    const tokenAddr = await token.getAddress();
    const user = actors.user1;
    const block = await ethers.provider.getBlock("latest");
    const expiry = (block?.timestamp ?? 0) + 7200;

    const decisionHash = await policy
      .connect(actors.agent)
      .applyPolicy.staticCall(user.address, ethers.parseEther("1000"), 500n, expiry);
    await policy
      .connect(actors.agent)
      .applyPolicy(user.address, ethers.parseEther("1000"), 500n, expiry);

    // Create multiple intents approaching limit with distinct expiries
    for (let i = 0; i < 5; i++) {
      await policy
        .connect(actors.agent)
        .createIntent(
          decisionHash,
          tokenAddr,
          ethers.parseEther("1000"),
          expiry - i - 1,
          100n
        );
    }

    const currentSpend = await policy.dailySpend(actors.agent.address);
    expect(currentSpend).to.equal(maxDaily);

    // Creating another intent exceeding daily limit must revert
    await expect(
      policy
        .connect(actors.agent)
        .createIntent(
          decisionHash,
          tokenAddr,
          ethers.parseEther("1"),
          expiry,
          100n
        )
    ).to.be.revertedWith("Policy: daily limit");
  });

  it("invariant: randomized policy action sequences preserve pause and execution invariants", async () => {
    const users = [actors.user1, actors.user2, actors.user3];
    const handler = new PolicyHandler(
      policy,
      token,
      actors.owner,
      actors.emergencyAdmin,
      actors.agent,
      users
    );

    const trace = generatePolicyActions(42, 30, users.length);
    for (const step of trace.steps) {
      await handler.executeAction(step);
      await handler.verifyInvariants();
    }
  });

  it("deliberate fault: removing pause guard allows operations during emergency pause", async () => {
    await policy.connect(actors.owner).pause();
    expect(await policy.paused()).to.be.true;

    const block = await ethers.provider.getBlock("latest");
    const expiry = (block?.timestamp ?? 0) + 3600;

    // Policy application must revert under pause; if guard is absent this would succeed
    await expect(
      policy
        .connect(actors.agent)
        .applyPolicy(actors.user1.address, ethers.parseEther("100"), 100n, expiry)
    ).to.be.revertedWith("Policy: paused");
  });
});
