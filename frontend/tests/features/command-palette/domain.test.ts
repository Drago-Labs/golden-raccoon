import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { routeCommands } from "../../../src/lib/commandPalette/registry";
import { normalizeSearch } from "../../../src/lib/commandPalette/normalize";
import { rankCommands } from "../../../src/lib/commandPalette/ranking";
import { sessionCommands, scopeKey } from "../../../src/lib/commandPalette/scope";
import { rememberCommand } from "../../../src/lib/commandPalette/recent";
import { isPaletteShortcut } from "../../../src/lib/commandPalette/shortcuts";
import { scope, assets } from "./fixtures";
describe("route and local search contracts", () => {
  it("registers only existing baseline destinations", () => {
    for (const command of routeCommands) {
      expect(existsSync(resolve(process.cwd(), `src/app${command.href}/page.tsx`))).toBe(true);
      expect(command.href).not.toContain("?");
    }
    expect(new Set(routeCommands.map(c => c.id)).size).toBe(routeCommands.length);
  });
  it("normalizes Unicode search without normalizing asset identity", () => {
    expect(normalizeSearch(" CAFÉ  ＵＳＤ ")).toBe("cafe usd");
    const local = sessionCommands(scope, assets);
    expect(rankCommands(local, "cafe")[0].label).toBe("USD");
    expect(local[0].id).not.toBe(local[1].id);
  });
  it("ranks exact/prefix matches before keyword matches with stable ties", () => {
    expect(rankCommands(routeCommands, "scan")[0].id).toBe("route:scan");
    expect(rankCommands(routeCommands, "zzzz")).toEqual([]);
    expect(rankCommands(routeCommands, "", ["route:history"])[0].id).toBe("route:history");
  });
  it("isolates wallet and network, including case-sensitive Stellar wallets", () => {
    expect(sessionCommands(scope, assets)).toHaveLength(2);
    expect(sessionCommands(null, assets)).toEqual([]);
    expect(sessionCommands({ ...scope, wallet: scope.wallet.toLowerCase() }, assets)).toEqual([]);
    expect(scopeKey({wallet:"0xAB",family:"evm",network:"base"})).toBe(scopeKey({wallet:"0xab",family:"evm",network:"base"}));
    expect(sessionCommands({ ...scope, network: "stellar-pubnet" }, assets)).toHaveLength(1);
  });
  it("bounds assets/results and deduplicates by full identity", () => {
    expect(sessionCommands(scope, [...assets, ...assets])).toHaveLength(2);
    const lots = Array.from({length:300},(_,i)=>({...assets[0],assetKey:`asset:${i}`}));
    expect(sessionCommands(scope,lots)).toHaveLength(200);
    expect(rankCommands(sessionCommands(scope,lots),"")).toHaveLength(30);
  });
  it("bounds and deduplicates recent commands without storage", () => {
    let recent: string[] = [];for(let i=0;i<20;i++)recent=rememberCommand(recent, String(i));
    expect(recent).toHaveLength(8);expect(rememberCommand(recent,"17").slice(0,3)).toEqual(["17","19","18"]);
  });
  it("respects text fields, IME and conflicting shortcuts", () => {
    expect(isPaletteShortcut(new KeyboardEvent("keydown", {key:"k",ctrlKey:true}))).toBe(true);
    expect(isPaletteShortcut(new KeyboardEvent("keydown", {key:"k",metaKey:true,isComposing:true}))).toBe(false);
    expect(isPaletteShortcut(new KeyboardEvent("keydown", {key:"k",metaKey:true,altKey:true}))).toBe(false);
    const input=document.createElement("input");let accepted=true;
    input.addEventListener("keydown",e=>{accepted=isPaletteShortcut(e);});input.dispatchEvent(new KeyboardEvent("keydown",{key:"k",ctrlKey:true}));
    expect(accepted).toBe(false);
  });
});
