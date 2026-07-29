# Accessibility audit — WCAG 2.2 AA (issue #42)

This document tracks the accessibility remediation done against Golden
Raccoon's core application flows: scan, wallet, risk report, strategy,
execution, history, operations, and Soroban publication.

This is an internal engineering audit and remediation log, not a legal
accessibility certification or conformance statement. No claim of formal
WCAG conformance certification is made; treat this as evidence of
good-faith, ongoing remediation.

## Scope

Routes and flows reviewed:

- Global shell — `frontend/src/components/AppShell.tsx` (skip link, header,
  nav landmarks, main landmark).
- Dashboard / portfolio — `frontend/src/components/DashboardClient.tsx`
  (wallet-required state, portfolio loading state, scan token modal, agent
  run modal).
- Token scan — `frontend/src/components/TokenScanClient.tsx` (free/detailed
  scan, x402 payment flow, AI risk report).
- Risk report — `frontend/src/components/RiskScoreCard.tsx` and
  `frontend/src/components/RiskBreakdownCard.tsx`.
- Strategy / auto mode onboarding —
  `frontend/src/components/AutoModeOnboarding.tsx` (used as the reference
  implementation; already had reasonable landmark/labeling patterns).
- Alerts / operations — `frontend/src/components/AlertRuleForm.tsx`,
  `frontend/src/components/RuleForm.tsx`.
- Wallet connect — `frontend/src/components/WalletConnectButton.tsx`.
- History — agent run history views rendered through
  `frontend/src/components/AgentResultPanel.tsx` (reuses the shared risk and
  status primitives fixed here; no route-specific structural issues found).
- Soroban publication — `frontend/src/components/StellarRiskPublishButton.tsx`
  is invoked from the scan/dashboard flows covered above; it uses plain
  buttons and status text and did not require structural changes.

Out of scope for this pass (see "Remaining manual steps" below): a full pass
over every `recharts` chart beyond `RiskScoreCard`'s custom SVG gauge, and
automated Playwright + axe-core end-to-end coverage.

## Findings

Severity legend: **Critical** (blocks task completion for keyboard/screen
reader users), **Serious** (significant friction or missing information),
**Moderate** (usability/clarity gap), **Minor** (polish).

| # | Severity | Area | Issue | Status |
|---|----------|------|-------|--------|
| 1 | Critical | Global shell | No skip link; keyboard users had to tab through the full header/nav on every page. | Fixed — skip link to `#main-content` in `AppShell`. |
| 2 | Serious | Global shell | `<nav>` elements had no accessible name, and there was no `<main>` landmark, making the page structure hard to navigate with a screen reader's landmark list. | Fixed — `aria-label="Primary"` on both nav variants, `<main id="main-content" tabIndex={-1}>`. |
| 3 | Serious | Global shell / all pages | Focus indicator relied on browser default outline, which is suppressed by several third-party button/input resets in the app; keyboard focus was frequently invisible. | Fixed — global `:focus-visible` rule using brand gold (`#d9a441`) in `globals.css`. |
| 4 | Serious | Risk report | Risk level ("Low"/"Medium"/"High") was communicated only via badge color; the badge itself had no accessible label text beyond the level word rendered in colored text. | Fixed — visible "Risk level: {level}" text plus a non-color icon dot; gauge `aria-label` spells out score and level. |
| 5 | Moderate | Risk report | The "why this score" breakdown popover had no dialog semantics, no heading association, and focus was not moved into it, so screen reader and keyboard users had no reliable way to know it opened or where they were. | Fixed — `role="dialog"` + `aria-labelledby`, focus moves to the close button on open and returns to the trigger on close, `Escape` closes it. |
| 6 | Moderate | Risk report | Category weight bars were purely visual (`div` with a colored fill); no accessible value was exposed. | Fixed — `role="meter"` with `aria-valuenow/min/max` on each bar; the numeric "X/100" text remains visible alongside it. |
| 7 | Serious | Scan / dashboard / alerts | Async status changes (scanning, payment steps, portfolio load, agent run, form save errors) were communicated only via visual state changes; screen reader users received no announcement when a background operation finished or failed. | Fixed — shared `LiveRegion` helper wired into `TokenScanClient`, `DashboardClient`, and `AlertRuleForm`. |
| 8 | Moderate | Forms | Form-level errors (e.g. "Could not save rule.") were rendered as plain text with no programmatic link to the control that triggered them. | Fixed — `AlertRuleForm` submit control now has `aria-invalid`/`aria-describedby` pointing at a live, visible error region; `TokenScanClient`'s query input does the same for scan failures. |
| 9 | Minor | Motion | No `prefers-reduced-motion` handling; pulse/ping/spin animations used throughout loading states could not be disabled by users sensitive to motion. | Fixed — global reduced-motion media query shortens all animations/transitions to near-zero. |
| 10 | Moderate | Charts | Other `recharts`-based visualizations outside `RiskScoreCard` (e.g. in `AgentResultPanel` or elsewhere) were not audited in this pass. | Open — tracked under "Remaining manual steps". |
| 11 | Minor | Automated E2E | No Playwright/axe-core coverage exists yet for keyboard traversal or automated contrast/ARIA scanning. | Open — static checks added instead (`npm run test:a11y`); Playwright+axe is a follow-up. |

## Before / after

- **Skip navigation:** Before — first Tab press landed on the logo link, then
  every nav item, before reaching page content. After — first Tab press
  reveals a visible "Skip to main content" link that jumps focus straight to
  `<main id="main-content">`.
- **Keyboard focus visibility:** Before — many buttons/links had focus rings
  suppressed by `outline: none` resets with no visible replacement. After —
  a global `:focus-visible` rule guarantees a 3px gold outline on any
  focused interactive element, app-wide.
- **Risk level:** Before — only a colored pill (`High`/`Medium`/`Low` text in
  a color-coded color) conveyed risk level. After — the pill always renders
  "Risk level: {level}" as plain text plus an `aria-label`-equipped gauge
  that states the level and score in words, so color-blind and screen
  reader users get the same information as sighted users.
- **Breakdown popover:** Before — a floating `<div>` with a close button;
  opening it didn't move focus or announce anything. After — `role="dialog"`
  with `aria-labelledby`, focus moves to the close button when it opens, and
  `Escape`/close button return focus to the toggle button.
- **Status announcements:** Before — scanning/payment/portfolio-loading
  states were silent for screen reader users. After — a shared `LiveRegion`
  component announces state changes (e.g. "Scanning token: Liquidity…",
  "Scan complete. TOKEN risk 42 out of 100.", or error text) as they happen.
- **Reduced motion:** Before — pulse/ping/spin CSS animations always ran at
  full speed. After — `@media (prefers-reduced-motion: reduce)` collapses
  animation/transition durations to near-zero for users who have that OS
  preference set.

## Manual audit checklist

Run this checklist by hand before any release that touches UI, in addition
to `npm run test:a11y`:

- [ ] **Keyboard only** — Unplug/ignore the mouse. Tab from the top of
      `/dashboard`, `/scan`, `/strategy`, `/alerts`, `/history` through every
      interactive element. Confirm: skip link appears first and works, focus
      order matches visual order, no keyboard trap in the scan modal, agent
      run modal, or risk breakdown popover, and `Escape` closes overlays.
- [ ] **Screen reader smoke test** — Using VoiceOver (macOS: Cmd+F5) or
      NVDA, navigate by landmarks and headings on each core route. Confirm
      the page has one `main` landmark, nav has an announced name
      ("Primary"), and status changes (scan running/complete/error, wallet
      connect, agent run) are announced without requiring a manual refresh
      of focus.
- [ ] **Contrast** — Spot-check text/background combinations, especially
      `text-white/38`–`text-white/54` utility classes on the `#050505`
      background and colored risk badges, with a contrast checker against
      the WCAG AA thresholds (4.5:1 normal text, 3:1 large text/UI
      components).
- [ ] **Zoom to 200%** — In the browser, set zoom to 200% (not just the OS
      text size) on `/dashboard` and `/scan`. Confirm no content is clipped
      or overlapping, and all controls remain operable without horizontal
      scrolling.
- [ ] **Mobile reflow** — At a 360px-wide viewport, confirm the mobile nav,
      scan form, and alert rule form reflow to a single column without
      horizontal scrolling and without losing any functionality available on
      desktop.
- [ ] **Reduced motion** — Enable "Reduce motion" in OS accessibility
      settings, reload `/dashboard`, and confirm the pulsing/spinning loading
      indicators are static or near-instant rather than continuously
      animating.

## Remaining manual steps

- Extend the `role="meter"`/text-equivalent treatment applied to
  `RiskScoreCard` to the remaining `recharts`-based visualizations elsewhere
  in the app (e.g. any historical trend charts). This was deliberately
  deferred to avoid an oversized, high-risk diff in this change; each chart
  should get its own small follow-up PR with a text/table fallback.
- Add Playwright + `@axe-core/playwright` end-to-end coverage once
  Playwright is introduced to this repository (there is no Playwright
  suite today). Until then, `npm run test:a11y` (see
  `frontend/scripts/a11y-check.ts`) provides static regression coverage,
  and the manual checklist above should be run by hand for each release
  touching UI.
- Run a real assistive-technology pass (VoiceOver + Safari, NVDA + Firefox
  or Chrome) against a deployed preview before any public accessibility
  claim is made; this document records engineering remediation, not
  third-party or user testing results.
- Consider adding a `prefers-contrast: more` treatment if user feedback
  indicates the glassmorphism panels are too low-contrast for some users
  even after the AA-level fixes above.
