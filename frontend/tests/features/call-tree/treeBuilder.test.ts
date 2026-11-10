import { describe, expect, it } from "vitest";
import { buildCallTree, type RawInvocationMeta } from "@/server/research/call-tree";
import nestedCall from "./data/nested-call.json";
import noDiagnostics from "./data/no-diagnostics.json";

describe("buildCallTree", () => {
  it("reconstructs nested call depth and execution order from fn_call / fn_return events", () => {
    const meta = nestedCall as unknown as RawInvocationMeta;
    const roots = buildCallTree(meta, meta.events);
    expect(roots).toHaveLength(1);
    expect(roots[0]!.functionName).toBe("swap_exact_tokens");
    expect(roots[0]!.depth).toBe(0);
    expect(roots[0]!.children).toHaveLength(1);
    expect(roots[0]!.children[0]!.functionName).toBe("transfer");
    expect(roots[0]!.children[0]!.depth).toBe(1);
  });

  it("builds a top-level-only tree when diagnostics are unavailable", () => {
    const meta = noDiagnostics as unknown as RawInvocationMeta;
    const roots = buildCallTree(meta, []);
    expect(roots).toHaveLength(1);
    expect(roots[0]!.children).toEqual([]);
  });
});
