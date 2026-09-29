export function rememberCommand(recent: readonly string[], id: string): string[] {
  return [id, ...recent.filter(value => value !== id)].slice(0, 8);
}
