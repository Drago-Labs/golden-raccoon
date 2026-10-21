import { describe, expect, it } from "vitest";
import {
  available,
  isRpcConsistencyError,
  RpcConsistencyError,
  unavailable,
} from "@/server/research/rpc-consistency/errors";

describe("errors", () => {
  it("builds a typed error and recognises it", () => {
    const error = new RpcConsistencyError("network_mismatch", "Networks were mixed.", { network: "testnet" });

    expect(error.name).toBe("RpcConsistencyError");
    expect(error.code).toBe("network_mismatch");
    expect(error.details).toEqual({ network: "testnet" });
    expect(isRpcConsistencyError(error)).toBe(true);
    expect(isRpcConsistencyError(new Error("other"))).toBe(false);
  });

  it("represents provider availability as a state, not an exception", () => {
    expect(available({ ledger: 1 }).status).toBe("available");
    expect(unavailable("Horizon timed out.").status).toBe("unavailable");
  });
});
