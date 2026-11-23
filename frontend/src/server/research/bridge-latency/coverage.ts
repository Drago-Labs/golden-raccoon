export function buildCoverage(bridge: string, notes: string[] = []) {
  return { notes: [`Matching is by message id for ${bridge}. A delivery with a different id is a different transfer.`, "Latency is deliveredAt minus sentAt, in seconds.", ...notes] };
}
