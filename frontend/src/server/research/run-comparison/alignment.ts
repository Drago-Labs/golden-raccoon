/**
 * Aligning agents across two runs by stable semantic identity.
 *
 * The agent name is the identity, not the array index. Two runs frequently
 * store their results in different orders — a reordered list compared
 * positionally would report every agent as changed, which is the failure this
 * module exists to prevent.
 */
import type { AgentResult } from "@/server/types";
import type { AgentAlignment } from "./schema";

export type AgentPair = {
  agent: string;
  alignment: AgentAlignment;
  left: AgentResult | null;
  right: AgentResult | null;
};

/**
 * Pairs agents by name.
 *
 * A run that somehow stores the same agent twice keeps only its first result
 * for alignment, and the duplicate is reported by the caller — silently
 * merging two results for one agent would invent a number neither contained.
 */
export function alignAgents(left: AgentResult[], right: AgentResult[]): { pairs: AgentPair[]; duplicates: string[] } {
  const duplicates: string[] = [];

  function index(results: AgentResult[]): Map<string, AgentResult> {
    const map = new Map<string, AgentResult>();

    for (const result of results) {
      const agent = String(result.agent);

      if (map.has(agent)) {
        duplicates.push(agent);
        continue;
      }

      map.set(agent, result);
    }

    return map;
  }

  const leftByAgent = index(left);
  const rightByAgent = index(right);
  const agents = [...new Set([...leftByAgent.keys(), ...rightByAgent.keys()])].sort();

  const pairs = agents.map((agent) => {
    const leftResult = leftByAgent.get(agent) ?? null;
    const rightResult = rightByAgent.get(agent) ?? null;

    return {
      agent,
      alignment: (leftResult && rightResult ? "present_in_both" : leftResult ? "only_in_left" : "only_in_right") as AgentAlignment,
      left: leftResult,
      right: rightResult,
    };
  });

  return { pairs, duplicates: [...new Set(duplicates)] };
}
