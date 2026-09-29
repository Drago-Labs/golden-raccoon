import { useMemo, useState } from "react";
import { routeCommands } from "./registry";
import { rankCommands } from "./ranking";
import { rememberCommand } from "./recent";
import { sessionCommands } from "./scope";
import type { PaletteScope, SessionAsset } from "./schema";
// Parent keys this controller by wallet/network and never persists its state.
export function usePaletteController(scope: PaletteScope | null, assets: readonly SessionAsset[]) {
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [selected, setSelected] = useState(0);
  const commands = useMemo(() => [...routeCommands, ...sessionCommands(scope, assets)], [scope, assets]);
  const results = rankCommands(commands, query, recent);
  return { query, setQuery: (value: string) => { setQuery(value); setSelected(0); },
    results, selected: Math.min(selected, Math.max(0, results.length - 1)), setSelected,
    remember: (id: string) => setRecent(previous => rememberCommand(previous, id)) };
}
