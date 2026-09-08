import { ethers } from "hardhat";
import { expect } from "chai";
import gasSnapshot from "../../snapshots/gas.json";

interface GasMetrics {
  [path: string]: number;
}

const snapshot: GasMetrics = gasSnapshot;
const MAX_ALLOWED_INCREASE_PERCENT = 15;

function checkGasRegression(actualGas: number, baselineGas: number, pathName: string): void {
  const percentDelta = ((actualGas - baselineGas) / baselineGas) * 100;
  if (percentDelta > MAX_ALLOWED_INCREASE_PERCENT) {
    throw new Error(
      `Gas regression detected on ${pathName}: used ${actualGas} gas, baseline is ${baselineGas} (+${percentDelta.toFixed(
        2
      )}%, max allowed is +${MAX_ALLOWED_INCREASE_PERCENT}%)`
    );
  }
}

describe("Gas Snapshot Regression Gates", () => {
  let measuredGas: GasMetrics = {};

  before(async () => {
    const [, , agent, user] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("MockERC20");
    const token = await Token.deploy();

    const Policy = await ethers.getContractFactory("GoldRaccoonPolicy");
    const policy = await Policy.deploy();
    await policy.setAgent(agent.address);
    await policy.setLimits(ethers.parseEther("1000000"), 1000n, ethers.parseEther("1000000"));

    const Vault = await ethers.getContractFactory("GoldRaccoonVault");
    const vault = await Vault.deploy(await policy.getAddress(), agent.address);

    const Audit = await ethers.getContractFactory("GoldenRaccoonAudit");
    const audit = await Audit.deploy();

    const tokenAddr = await token.getAddress();
    const vaultAddr = await vault.getAddress();
    const amount = ethers.parseEther("100");

    await token.mint(user.address, amount * 10n);
    await token.connect(user).approve(vaultAddr, amount * 10n);

    // 1. Vault deposit
    const txDeposit = await vault.connect(user).deposit(tokenAddr, amount);
    const rcDeposit = await txDeposit.wait();

    // 2. Policy applyPolicy
    const block = await ethers.provider.getBlock("latest");
    const expiry = (block?.timestamp ?? 0) + 3600;
    const decisionHash = await policy.connect(agent).applyPolicy.staticCall(user.address, amount, 500n, expiry);
    const txApply = await policy.connect(agent).applyPolicy(user.address, amount, 500n, expiry);
    const rcApply = await txApply.wait();

    // 3. Policy createIntent
    const intentHash = await policy.connect(agent).createIntent.staticCall(decisionHash, tokenAddr, amount, expiry, 100n);
    const txCreate = await policy.connect(agent).createIntent(decisionHash, tokenAddr, amount, expiry, 100n);
    const rcCreate = await txCreate.wait();

    // 4. Policy executeIntent
    const txExec = await policy.connect(agent).executeIntent(intentHash);
    const rcExec = await txExec.wait();

    // 5. Vault withdraw
    const decisionHash2 = await policy.connect(agent).applyPolicy.staticCall(user.address, amount, 500n, expiry + 10);
    const txApply2 = await policy.connect(agent).applyPolicy(user.address, amount, 500n, expiry + 10);
    await txApply2.wait();
    const intentHash2 = await policy.connect(agent).createIntent.staticCall(decisionHash2, tokenAddr, amount, expiry + 10, 100n);
    const txCreate2 = await policy.connect(agent).createIntent(decisionHash2, tokenAddr, amount, expiry + 10, 100n);
    await txCreate2.wait();
    const txWithdraw = await vault.connect(agent).withdraw(tokenAddr, amount, user.address, intentHash2);
    const rcWithdraw = await txWithdraw.wait();

    // 6. Audit logDecision
    const policyHash = ethers.keccak256(ethers.toUtf8Bytes("audit-policy"));
    await audit.connect(user).setPolicy(policyHash);
    await audit.connect(user).authorizeAgent(agent.address, policyHash, expiry + 3600);

    const decId = ethers.keccak256(ethers.toUtf8Bytes("dec-1"));
    const decHash = ethers.keccak256(ethers.toUtf8Bytes("dechash-1"));
    const txLog = await audit.connect(agent).logDecision(user.address, policyHash, decId, decHash, 25);
    const rcLog = await txLog.wait();

    // 7. Audit recordIntent
    const intId = ethers.keccak256(ethers.toUtf8Bytes("intent-1"));
    const intHash = ethers.keccak256(ethers.toUtf8Bytes("inthash-1"));
    const txRecord = await audit.connect(agent).recordIntent(user.address, policyHash, intId, decId, intHash, expiry);
    const rcRecord = await txRecord.wait();

    measuredGas = {
      "GoldRaccoonVault.deposit": Number(rcDeposit!.gasUsed),
      "GoldRaccoonVault.withdraw": Number(rcWithdraw!.gasUsed),
      "GoldRaccoonPolicy.applyPolicy": Number(rcApply!.gasUsed),
      "GoldRaccoonPolicy.createIntent": Number(rcCreate!.gasUsed),
      "GoldRaccoonPolicy.executeIntent": Number(rcExec!.gasUsed),
      "GoldenRaccoonAudit.logDecision": Number(rcLog!.gasUsed),
      "GoldenRaccoonAudit.recordIntent": Number(rcRecord!.gasUsed),
    };
  });

  it("all hot paths stay within snapshot gas tolerance", () => {
    for (const [pathName, baseline] of Object.entries(snapshot)) {
      const actual = measuredGas[pathName];
      expect(actual, `Missing gas metric for ${pathName}`).to.not.be.undefined;
      expect(() => checkGasRegression(actual, baseline, pathName)).to.not.throw();
    }
  });

  it("deliberate fault: artificially bloated gas consumption fails the regression gate", () => {
    const baseline = snapshot["GoldRaccoonVault.deposit"];
    const artificiallyBloatedGas = Math.floor(baseline * 1.3); // +30% gas inflation

    expect(() =>
      checkGasRegression(artificiallyBloatedGas, baseline, "GoldRaccoonVault.deposit")
    ).to.throw(/Gas regression detected on GoldRaccoonVault.deposit/);
  });
});
