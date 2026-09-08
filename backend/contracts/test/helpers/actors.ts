import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { MockERC20 } from "../../typechain-types";

export interface TestActors {
  owner: HardhatEthersSigner;
  emergencyAdmin: HardhatEthersSigner;
  agent: HardhatEthersSigner;
  user1: HardhatEthersSigner;
  user2: HardhatEthersSigner;
  user3: HardhatEthersSigner;
  attacker: HardhatEthersSigner;
  others: HardhatEthersSigner[];
}

/**
 * Setup and partition signers into explicit semantic roles
 */
export async function getTestActors(): Promise<TestActors> {
  const signers = await ethers.getSigners();
  return {
    owner: signers[0],
    emergencyAdmin: signers[1],
    agent: signers[2],
    user1: signers[3],
    user2: signers[4],
    user3: signers[5],
    attacker: signers[6],
    others: signers.slice(7),
  };
}

/**
 * Distribute tokens to target actors
 */
export async function distributeTokens(
  token: MockERC20,
  sender: HardhatEthersSigner,
  recipients: HardhatEthersSigner[],
  amount: bigint
): Promise<void> {
  for (const recipient of recipients) {
    await token.connect(sender).transfer(recipient.address, amount);
  }
}
