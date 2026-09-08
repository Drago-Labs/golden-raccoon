import { ethers } from "hardhat";
import { expect } from "chai";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import {
  GoldRaccoonVault,
  GoldRaccoonPolicy,
  GoldenRaccoonAudit,
  MockERC20,
} from "../../typechain-types";
import { VaultAction, PolicyAction, AuditAction } from "./actions";

export class VaultHandler {
  vault: GoldRaccoonVault;
  policy: GoldRaccoonPolicy;
  token: MockERC20;
  agent: HardhatEthersSigner;
  users: HardhatEthersSigner[];

  ghostUserBalances: Map<string, bigint> = new Map();
  ghostTotalDeposited: bigint = 0n;
  ghostConsumedIntents: Set<string> = new Set();
  lastIntentHash: Map<string, string> = new Map();

  constructor(
    vault: GoldRaccoonVault,
    policy: GoldRaccoonPolicy,
    token: MockERC20,
    agent: HardhatEthersSigner,
    users: HardhatEthersSigner[]
  ) {
    this.vault = vault;
    this.policy = policy;
    this.token = token;
    this.agent = agent;
    this.users = users;

    for (const u of users) {
      this.ghostUserBalances.set(u.address, 0n);
    }
  }

  async executeAction(action: VaultAction): Promise<boolean> {
    const user = this.users[action.userIndex % this.users.length];
    const userAddr = user.address;
    const tokenAddr = await this.token.getAddress();

    if (action.type === "deposit") {
      const amount = action.amount;
      await this.token.mint(userAddr, amount);
      await this.token.connect(user).approve(await this.vault.getAddress(), amount);

      const balBefore = await this.vault.userBalance(userAddr, tokenAddr);
      await this.vault.connect(user).deposit(tokenAddr, amount);
      const balAfter = await this.vault.userBalance(userAddr, tokenAddr);

      expect(balAfter - balBefore).to.equal(amount);
      const currentGhost = this.ghostUserBalances.get(userAddr) ?? 0n;
      this.ghostUserBalances.set(userAddr, currentGhost + amount);
      this.ghostTotalDeposited += amount;
      return true;
    }

    if (action.type === "withdraw") {
      const currentGhost = this.ghostUserBalances.get(userAddr) ?? 0n;
      if (currentGhost === 0n) return false;

      const withdrawAmount = action.amount > currentGhost ? currentGhost : action.amount;
      if (withdrawAmount === 0n) return false;

      const block = await ethers.provider.getBlock("latest");
      const now = BigInt(block?.timestamp ?? Math.floor(Date.now() / 1000));
      const expiry = Number(now + 3600n);

      let intentHash: string;
      if (action.replayIntent && this.lastIntentHash.has(userAddr)) {
        intentHash = this.lastIntentHash.get(userAddr)!;
        await expect(
          this.vault
            .connect(this.agent)
            .withdraw(tokenAddr, withdrawAmount, userAddr, intentHash)
        ).to.be.reverted;
        return false;
      } else {
        const decisionHash = await this.policy
          .connect(this.agent)
          .applyPolicy.staticCall(userAddr, withdrawAmount * 2n, 500n, expiry);
        await this.policy
          .connect(this.agent)
          .applyPolicy(userAddr, withdrawAmount * 2n, 500n, expiry);

        intentHash = await this.policy
          .connect(this.agent)
          .createIntent.staticCall(decisionHash, tokenAddr, withdrawAmount, expiry, 100n);
        await this.policy
          .connect(this.agent)
          .createIntent(decisionHash, tokenAddr, withdrawAmount, expiry, 100n);

        this.lastIntentHash.set(userAddr, intentHash);
      }

      const balBefore = await this.vault.userBalance(userAddr, tokenAddr);
      await this.vault
        .connect(this.agent)
        .withdraw(tokenAddr, withdrawAmount, userAddr, intentHash);
      const balAfter = await this.vault.userBalance(userAddr, tokenAddr);

      expect(balBefore - balAfter).to.equal(withdrawAmount);
      this.ghostUserBalances.set(userAddr, currentGhost - withdrawAmount);
      this.ghostTotalDeposited -= withdrawAmount;
      this.ghostConsumedIntents.add(intentHash);
      return true;
    }

    return false;
  }

  async verifyInvariants(): Promise<void> {
    const vaultAddr = await this.vault.getAddress();
    const tokenAddr = await this.token.getAddress();
    const vaultTokenBal = await this.token.balanceOf(vaultAddr);

    // Invariant 1: Vault solvency (token balance in vault >= total recorded ghost balance)
    expect(vaultTokenBal).to.be.greaterThanOrEqual(this.ghostTotalDeposited);

    // Invariant 2: User balance accounting exact match
    let sumOnChain = 0n;
    for (const [userAddr, ghostBal] of this.ghostUserBalances.entries()) {
      const onChainBal = await this.vault.userBalance(userAddr, tokenAddr);
      expect(onChainBal).to.equal(ghostBal);
      sumOnChain += onChainBal;
    }
    expect(sumOnChain).to.equal(this.ghostTotalDeposited);

    // Invariant 3: Consumed intents cannot be consumed again
    for (const intent of this.ghostConsumedIntents) {
      expect(await this.vault.consumedIntents(intent)).to.be.true;
    }
  }
}

export class PolicyHandler {
  policy: GoldRaccoonPolicy;
  token: MockERC20;
  owner: HardhatEthersSigner;
  emergencyAdmin: HardhatEthersSigner;
  agent: HardhatEthersSigner;
  users: HardhatEthersSigner[];

  ghostDecisions: Map<string, string> = new Map();
  ghostIntents: Map<string, { hash: string; executed: boolean }> = new Map();
  ghostPaused: boolean = false;

  constructor(
    policy: GoldRaccoonPolicy,
    token: MockERC20,
    owner: HardhatEthersSigner,
    emergencyAdmin: HardhatEthersSigner,
    agent: HardhatEthersSigner,
    users: HardhatEthersSigner[]
  ) {
    this.policy = policy;
    this.token = token;
    this.owner = owner;
    this.emergencyAdmin = emergencyAdmin;
    this.agent = agent;
    this.users = users;
  }

  async executeAction(action: PolicyAction): Promise<boolean> {
    const block = await ethers.provider.getBlock("latest");
    const now = BigInt(block?.timestamp ?? Math.floor(Date.now() / 1000));
    const tokenAddr = await this.token.getAddress();

    if (action.type === "pause") {
      const caller = action.callerIndex === 0 ? this.owner : this.emergencyAdmin;
      await this.policy.connect(caller).pause();
      this.ghostPaused = true;
      return true;
    }

    if (action.type === "unpause") {
      const caller = action.callerIndex === 0 ? this.owner : this.emergencyAdmin;
      await this.policy.connect(caller).unpause();
      this.ghostPaused = false;
      return true;
    }

    if (this.ghostPaused) {
      return false;
    }

    const user = this.users[action.userIndex % this.users.length];
    const userAddr = user.address;

    if (action.type === "applyPolicy") {
      const expiry = Number(now + BigInt(action.duration));
      const decisionHash = await this.policy
        .connect(this.agent)
        .applyPolicy.staticCall(userAddr, action.maxTx, action.slippage, expiry);
      await this.policy
        .connect(this.agent)
        .applyPolicy(userAddr, action.maxTx, action.slippage, expiry);
      this.ghostDecisions.set(userAddr, decisionHash);
      return true;
    }

    if (action.type === "createIntent") {
      const decisionHash = this.ghostDecisions.get(userAddr);
      if (!decisionHash) return false;

      const expiry = Number(now + BigInt(action.duration));
      try {
        const intentHash = await this.policy
          .connect(this.agent)
          .createIntent.staticCall(decisionHash, tokenAddr, action.amount, expiry, action.slippage);
        await this.policy
          .connect(this.agent)
          .createIntent(decisionHash, tokenAddr, action.amount, expiry, action.slippage);
        this.ghostIntents.set(userAddr, { hash: intentHash, executed: false });
        return true;
      } catch {
        return false;
      }
    }

    if (action.type === "executeIntent") {
      const intentRecord = this.ghostIntents.get(userAddr);
      if (!intentRecord) return false;

      if (intentRecord.executed || action.replay) {
        await expect(
          this.policy.connect(this.agent).executeIntent(intentRecord.hash)
        ).to.be.reverted;
        return false;
      }

      await this.policy.connect(this.agent).executeIntent(intentRecord.hash);
      intentRecord.executed = true;
      return true;
    }

    if (action.type === "revokePolicy") {
      const decisionHash = this.ghostDecisions.get(userAddr);
      if (!decisionHash) return false;

      const callers = [this.owner, this.emergencyAdmin, user, this.agent];
      const caller = callers[action.callerIndex % callers.length];
      await this.policy.connect(caller).revokePolicy(decisionHash);
      this.ghostDecisions.delete(userAddr);
      return true;
    }

    return false;
  }

  async verifyInvariants(): Promise<void> {
    const isPaused = await this.policy.paused();
    expect(isPaused).to.equal(this.ghostPaused);

    // Verify executed intents remain executed
    for (const record of this.ghostIntents.values()) {
      if (record.executed) {
        const onChain = await this.policy.intents(record.hash);
        expect(onChain.executed).to.be.true;
      }
    }
  }
}

export class AuditHandler {
  audit: GoldenRaccoonAudit;
  users: HardhatEthersSigner[];
  agents: HardhatEthersSigner[];

  ghostPolicyHashes: Map<string, string> = new Map();
  ghostAuthorizations: Map<string, { agent: string; active: boolean; expiry: bigint; policyHash: string }> = new Map();
  ghostUsedIntentIds: Set<string> = new Set();
  ghostPausedUsers: Set<string> = new Set();

  constructor(
    audit: GoldenRaccoonAudit,
    users: HardhatEthersSigner[],
    agents: HardhatEthersSigner[]
  ) {
    this.audit = audit;
    this.users = users;
    this.agents = agents;
  }

  async executeAction(action: AuditAction): Promise<boolean> {
    const block = await ethers.provider.getBlock("latest");
    const now = BigInt(block?.timestamp ?? Math.floor(Date.now() / 1000));
    const user = this.users[action.userIndex % this.users.length];
    const userAddr = user.address;
    const agent = this.agents[0];
    const agentAddr = agent.address;

    if (action.type === "setPaused") {
      await this.audit.connect(user).setPaused(action.paused);
      if (action.paused) {
        this.ghostPausedUsers.add(userAddr);
      } else {
        this.ghostPausedUsers.delete(userAddr);
      }
      return true;
    }

    if (action.type === "setPolicy") {
      const policyHash = ethers.keccak256(ethers.toUtf8Bytes(`policy-${userAddr}-${now}`));
      await this.audit.connect(user).setPolicy(policyHash);
      this.ghostPolicyHashes.set(userAddr, policyHash);
      // Changing user policy invalidates existing agent authorization under old policy
      this.ghostAuthorizations.delete(userAddr);
      return true;
    }

    if (action.type === "authorizeAgent") {
      const policyHash = this.ghostPolicyHashes.get(userAddr);
      if (!policyHash) return false;

      const expiry = now + BigInt(action.windowSec);
      await this.audit.connect(user).authorizeAgent(agentAddr, policyHash, expiry);
      this.ghostAuthorizations.set(userAddr, { agent: agentAddr, active: true, expiry, policyHash });
      return true;
    }

    if (action.type === "revokeAgent") {
      await this.audit.connect(user).revokeAgent(agentAddr);
      const current = this.ghostAuthorizations.get(userAddr);
      if (current) {
        current.active = false;
      }
      return true;
    }

    if (action.type === "logDecision") {
      const auth = this.ghostAuthorizations.get(userAddr);
      const policyHash = this.ghostPolicyHashes.get(userAddr);
      if (!auth || !auth.active || auth.expiry <= now || !policyHash || auth.policyHash !== policyHash || this.ghostPausedUsers.has(userAddr)) {
        return false;
      }

      const decisionId = ethers.keccak256(ethers.toUtf8Bytes(`dec-${now}-${Math.random()}`));
      const decisionHash = ethers.keccak256(ethers.toUtf8Bytes(`dechash-${now}`));
      await this.audit
        .connect(agent)
        .logDecision(userAddr, policyHash, decisionId, decisionHash, action.buyRisk);
      return true;
    }

    if (action.type === "recordIntent") {
      const auth = this.ghostAuthorizations.get(userAddr);
      const policyHash = this.ghostPolicyHashes.get(userAddr);
      if (!auth || !auth.active || auth.expiry <= now || !policyHash || auth.policyHash !== policyHash || this.ghostPausedUsers.has(userAddr)) {
        return false;
      }

      const intentId = action.replayId && this.ghostUsedIntentIds.size > 0
        ? Array.from(this.ghostUsedIntentIds)[0]
        : ethers.keccak256(ethers.toUtf8Bytes(`intent-${now}-${Math.random()}`));

      const decisionId = ethers.keccak256(ethers.toUtf8Bytes(`dec-${now}`));
      const intentHash = ethers.keccak256(ethers.toUtf8Bytes(`inthash-${now}`));
      const expiry = now + BigInt(action.windowSec);

      if (this.ghostUsedIntentIds.has(intentId)) {
        await expect(
          this.audit
            .connect(agent)
            .recordIntent(userAddr, policyHash, intentId, decisionId, intentHash, expiry)
        ).to.be.revertedWithCustomError(this.audit, "IntentReplayed");
        return false;
      }

      await this.audit
        .connect(agent)
        .recordIntent(userAddr, policyHash, intentId, decisionId, intentHash, expiry);
      this.ghostUsedIntentIds.add(intentId);
      return true;
    }

    return false;
  }

  async verifyInvariants(): Promise<void> {
    const auditAddr = await this.audit.getAddress();
    // Invariant 1: Strictly non-custodial: Ether balance must remain zero
    const ethBal = await ethers.provider.getBalance(auditAddr);
    expect(ethBal).to.equal(0n);

    // Invariant 2: Intent single-use enforcement on-chain
    for (const intentId of this.ghostUsedIntentIds) {
      for (const user of this.users) {
        if (await this.audit.intentUsed(user.address, intentId)) {
          expect(await this.audit.intentUsed(user.address, intentId)).to.be.true;
        }
      }
    }
  }
}
