import type { AttributedInvocation, RawInvocation } from "./schema";

/**
 * Attribute each invocation to the originating account and optional intermediary.
 * Nested calls (via another contract) keep both the origin account and the relay.
 */
export function attributeCallers(invocations: RawInvocation[]): AttributedInvocation[] {
  return invocations.map((row) => {
    const intermediary = row.intermediary?.trim() || null;
    const viaContract = Boolean(intermediary) || row.directCaller.startsWith("C");

    return {
      ...row,
      intermediary: viaContract ? intermediary ?? row.directCaller : null,
      originatingAccount: row.originatingAccount.trim(),
      callerKind: viaContract ? "via_contract" : "direct_account",
    };
  });
}
