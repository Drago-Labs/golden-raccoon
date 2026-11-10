import { describe, expect, it } from "vitest";
import {
  buildCallTree,
  locateInnerFailure,
  type RawInvocationMeta,
} from "@/server/research/call-tree";
import failedInnerCall from "./data/failed-inner-call.json";

describe("locateInnerFailure", () => {
  it("pinpoints the deepest inner call node where execution failed", () => {
    const meta = failedInnerCall as unknown as RawInvocationMeta;
    const roots = buildCallTree(meta, meta.events);
    const failure = locateInnerFailure(roots);
    expect(failure).not.toBeNull();
    expect(failure!.functionName).toBe("transfer");
    expect(failure!.depth).toBe(1);
    expect(failure!.errorMessage).toMatch(/insufficient balance/);
  });
});
