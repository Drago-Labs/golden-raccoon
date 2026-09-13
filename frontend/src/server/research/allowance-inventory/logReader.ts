import { keccak256, stringToHex } from "viem";
import type { AllowancePair } from "./schema";
import type { AllowanceRpc } from "./rpc";

export const APPROVAL_TOPIC = keccak256(stringToHex("Approval(address,address,uint256)"));

function topicAddress(address: string) {
  return `0x${address.toLowerCase().slice(2).padStart(64, "0")}`;
}

function readAddress(topic: string | undefined): string | null {
  if (!topic || !/^0x[0-9a-fA-F]{64}$/.test(topic)) return null;
  return `0x${topic.slice(-40)}`.toLowerCase();
}

export async function discoverApprovalCandidates(
  rpc: AllowanceRpc,
  wallet: string,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<{ pairs: AllowancePair[]; malformedLogs: number }> {
  const logs = await rpc.logs({ fromBlock, toBlock, topics: [APPROVAL_TOPIC, topicAddress(wallet), null] });
  const pairs: AllowancePair[] = [];
  let malformedLogs = 0;
  for (const log of logs) {
    const spender = readAddress(log.topics[2]);
    if (!spender || !/^0x[0-9a-fA-F]{40}$/.test(log.address)) {
      malformedLogs += 1;
      continue;
    }
    pairs.push({ token: log.address.toLowerCase(), spender });
  }
  return { pairs, malformedLogs };
}
