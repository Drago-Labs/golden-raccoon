export function delegationCoverage(input: { historyAvailable: boolean; sourceAvailable: boolean }): string[] {
  return [input.historyAvailable ? "Authorization-list history available." : "Authorization history unavailable from this provider.", input.sourceAvailable ? "Verified target source inspected." : "Target source is unverified or unavailable."];
}
