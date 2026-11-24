export function explainCapabilities(input: { implementation: string | null; verifiedSource: boolean | null; privilegedFunctions: string[] }): string[] {
  if (input.verifiedSource !== true && !input.implementation) return ["Unknown delegated code: capabilities cannot be classified as safe."];
  const result = input.privilegedFunctions.map((name) => `Delegated code can call ${name} using the account's authority.`);
  return result.length ? result : ["No privileged function was identified in available verified evidence."];
}
