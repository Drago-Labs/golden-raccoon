export function buildCoverage(notes: string[]) {
  return {
    notes: [
      "External script hashes are the sha256 of the URL. The script body is not downloaded and is not executed.",
      "A header change or a new origin is a diff, not proof that the site was compromised.",
      ...notes,
    ],
  };
}
