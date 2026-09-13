export function flattenFootprint(input: {
  keys: string[];
  footprint?: { readOnly: string[]; readWrite: string[] };
}) {
  return [
    ...input.keys,
    ...(input.footprint?.readOnly ?? []),
    ...(input.footprint?.readWrite ?? []),
  ];
}
