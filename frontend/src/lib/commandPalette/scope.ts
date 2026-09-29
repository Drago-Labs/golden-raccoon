import type { PaletteScope, SessionAsset, Command } from "./schema";
import { MAX_ASSETS } from "./schema";
export function scopeKey(scope: PaletteScope | null): string {
  if (!scope) return "disconnected";
  return JSON.stringify([scope.family, scope.network, scope.family === "evm" ? scope.wallet.toLowerCase() : scope.wallet]);
}
export function sessionCommands(scope: PaletteScope | null, assets: readonly SessionAsset[]): Command[] {
  if (!scope) return [];
  const seen = new Set<string>();
  return assets.slice(0, MAX_ASSETS).filter(asset => scopeKey(asset.scope) === scopeKey(scope)).flatMap(asset => {
    if (!asset.assetKey || asset.assetKey.length > 240 || asset.symbol.length > 80) return [];
    const id = JSON.stringify(["asset", scope.family, scope.network, asset.assetKey]);
    if (seen.has(id)) return [];
    seen.add(id);
    return [{ id, label: asset.symbol, description: `${asset.name ?? asset.assetKey} · ${scope.network} · ${asset.source}`,
      href: asset.source === "watchlist" ? `/watchlist?wallet=${encodeURIComponent(scope.wallet)}` : "/dashboard",
      group: "Session assets" as const, keywords: [asset.assetKey, asset.symbol, asset.name ?? "", scope.network] }];
  });
}
