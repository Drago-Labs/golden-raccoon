import { normalizeSearch } from "./normalize";
import { MAX_QUERY_LENGTH, MAX_RESULTS, type Command } from "./schema";
export function rankCommands(commands: readonly Command[], query: string, recent: readonly string[] = []): Command[] {
  const normalized = normalizeSearch(query.slice(0, MAX_QUERY_LENGTH));
  const tokens = normalized.split(" ").filter(Boolean);
  return commands.map((command, index) => {
    const label = normalizeSearch(command.label);
    const haystack = normalizeSearch([command.label, command.description, ...command.keywords].join(" "));
    const score = normalized ? label === normalized ? 100 : label.startsWith(normalized) ? 80 : tokens.every(t => haystack.includes(t)) ? 40 : -1
      : recent.includes(command.id) ? 20 - recent.indexOf(command.id) : 0;
    return { command, score, index };
  }).filter(row => row.score >= 0).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, MAX_RESULTS).map(row => row.command);
}
