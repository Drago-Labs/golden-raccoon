import type { CallTreeDeps, RawInvocationMeta } from "@/server/research/call-tree";

export const TX_HASH = "a".repeat(64);

export function depsFromMeta(meta: RawInvocationMeta): CallTreeDeps {
  return {
    metaProvider: {
      async readInvocationMeta() {
        return meta;
      },
    },
  };
}
