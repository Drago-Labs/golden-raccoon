import type { PaletteScope, SessionAsset } from "../../../src/lib/commandPalette/schema";
export const scope: PaletteScope = { wallet: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", family: "stellar", network: "stellar-testnet" };
export const assets: SessionAsset[] = [
  { scope, assetKey: "USD:issuer-A", symbol: "USD", name: "Café asset", source: "watchlist" },
  { scope, assetKey: "USD:issuer-B", symbol: "USD", name: "Second issuer", source: "portfolio" },
  { scope: { ...scope, network: "stellar-pubnet" }, assetKey: "USD:issuer-A", symbol: "USD", name: "Public network", source: "watchlist" },
  { scope: { ...scope, wallet: "other-wallet" }, assetKey: "PRIVATE", symbol: "PRIVATE", source: "watchlist" },
];
