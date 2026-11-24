import { SEP41_REFERENCE_FUNCTIONS } from "./referenceInterface";
import type { ContractFunctionSpec, InterfaceDiffEntry, SpecParam } from "./schema";

function normalizeType(type: string): string {
  return type.trim().replace(/\s+/g, "");
}

function paramsEqual(expected: SpecParam[], actual: SpecParam[]): boolean {
  if (expected.length !== actual.length) return false;
  return expected.every((param, index) => {
    const other = actual[index];
    return normalizeType(param.type) === normalizeType(other.type);
  });
}

function describeParams(params: SpecParam[]): string {
  if (params.length === 0) return "()";
  return `(${params.map((p) => `${p.name || "_"}: ${p.type}`).join(", ")})`;
}

/**
 * Diffs a contract's function list against the SEP-41 reference.
 * Distinguishes missing, mismatched (name present but types differ), and extra entries.
 */
export function diffInterface(actualFunctions: ContractFunctionSpec[]): InterfaceDiffEntry[] {
  const byName = new Map(actualFunctions.map((fn) => [fn.name, fn]));
  const entries: InterfaceDiffEntry[] = [];
  const seen = new Set<string>();

  for (const expected of SEP41_REFERENCE_FUNCTIONS) {
    seen.add(expected.name);
    const actual = byName.get(expected.name);
    if (!actual) {
      entries.push({
        name: expected.name,
        kind: "missing",
        expectedInputs: expected.inputs,
        expectedOutputs: expected.outputs,
        detail: `Missing required function ${expected.name}${describeParams(expected.inputs)}`,
      });
      continue;
    }

    const inputsMatch = paramsEqual(expected.inputs, actual.inputs);
    const outputsMatch = paramsEqual(expected.outputs, actual.outputs);
    if (!inputsMatch || !outputsMatch) {
      const parts: string[] = [];
      if (!inputsMatch) {
        parts.push(
          `inputs expected ${describeParams(expected.inputs)} got ${describeParams(actual.inputs)}`,
        );
      }
      if (!outputsMatch) {
        parts.push(
          `outputs expected ${describeParams(expected.outputs)} got ${describeParams(actual.outputs)}`,
        );
      }
      entries.push({
        name: expected.name,
        kind: "mismatched",
        expectedInputs: expected.inputs,
        expectedOutputs: expected.outputs,
        actualInputs: actual.inputs,
        actualOutputs: actual.outputs,
        detail: parts.join("; "),
      });
      continue;
    }

    entries.push({
      name: expected.name,
      kind: "match",
      expectedInputs: expected.inputs,
      expectedOutputs: expected.outputs,
      actualInputs: actual.inputs,
      actualOutputs: actual.outputs,
      detail: "Matches SEP-41",
    });
  }

  for (const actual of actualFunctions) {
    if (seen.has(actual.name)) continue;
    entries.push({
      name: actual.name,
      kind: "extra",
      actualInputs: actual.inputs,
      actualOutputs: actual.outputs,
      detail: `Extra function ${actual.name}${describeParams(actual.inputs)} is not part of SEP-41`,
    });
  }

  return entries;
}
