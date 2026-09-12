# Local command palette

Use the Search button in AppShell or Ctrl/Command+K outside text fields. The
native modal dialog makes the page behind it inert; arrow keys select, Enter
navigates and Escape closes and returns focus. IME composition and editable-field
shortcuts are left alone. The palette code loads on first use. No command starts a
scan, requests a wallet signature or calls an API; destinations are baseline page
routes without scan query parameters.

The route registry lists only pages present at `d41a5ebeea2e`. Search uses bounded
Unicode-normalized text with stable exact/prefix/token ranking. Asset identities
are never search-normalized. `AppShell` optionally accepts `commandAssets`, an
explicit in-session array of `{ scope: { wallet, family, network }, assetKey,
symbol, name?, source }`. Only exact current-scope items are displayed; EVM wallet
case is canonicalized but Stellar identifiers are preserved. Asset commands open
the baseline dashboard or the supplied wallet's watchlist; they do not initiate a
scan. Current pages do not supply this optional data yet, so ordinary navigation
shows an honest no-session-assets notice instead of fetching data in the background.

Query, selection and recent commands stay in component memory. The recent list
is bounded and survives closing/reopening on the same mounted page. Wallet,
network and disconnect changes remount the entire controller, clearing private
results immediately, including a previously loaded dialog. Page navigation also
clears page-local history. There is no telemetry, persistent storage, server search
or wallet-session authentication call in this feature.

Verification from `frontend`:

```sh
npx vitest run --config tests/features/command-palette/vitest.config.mts
npx eslint src/lib/commandPalette src/components/commandPalette src/components/AppShell.tsx tests/features/command-palette
npx playwright test --config tests/features/command-palette/playwright.config.ts
```

Run `npm run quality:gate` at the repository root. The feature workflow runs the
focused suites and browser journeys. Fixtures cover same-symbol/different-issuer
assets, cross-network and cross-wallet exclusion, Unicode ranking, bounded recent
entries, IME, focus restoration, context changes and no-match results. Browser
journeys mount the real AppShell at `/offline`, use mocked external I/O and test
navigation to `/scan` plus a mobile/reduced-motion modal. No live wallet is used.

This branch includes the previously proposed two-file installation/parser repair
from #242 so it can be installed from `main` without another PR landing first.
No behavior from another feature issue is imported.
