# Research workspace accessibility

Follow-up to `docs/A11Y_AUDIT.md` for the insights/research workspaces that landed
after the core shell pass.

## Audited surfaces

| Workspace | Chart / diagram | Textual equivalent | Status announcements |
| --- | --- | --- | --- |
| Peg observations | DeviationChart (`aria-hidden`) | Observation table in PegWorkspace | LiveRegion |
| Liquidity depth | DepthChart (`aria-hidden`) | SizeLadder table | LiveRegion |
| Storage lifetime | LifetimeChart bars (`aria-hidden`) | Lifetime table including unavailable remaining ledgers | `aria-live` |
| Exposure map | ExposureGraph (`aria-hidden`) | DependencyTable always mounted (diagram never replaces it) | LiveRegion |
| Fee analysis | CostTimeline bars (`aria-hidden`) | CostTimeline table cells | LiveRegion |
| Other research panels | n/a or table-first | Existing captions / LiveRegion | Present |

## Manual assistive-technology pass

Recorded for this change (engineering smoke, not third-party certification):

- Browser: Chromium (latest available in local/CI check)
- Keyboard: Tab order through forms, view toggles, and tables at 320px and 200% zoom
- Screen reader: VoiceOver (macOS) / NVDA checklist — navigate by headings and tables on peg, liquidity, storage-lifetime, and exposure-map; confirm status text for loading/error without duplicate spam beyond LiveRegion + visible alert
- Remaining limitations: Playwright + `@axe-core/playwright` e2e still deferred (see A11Y_AUDIT); color contrast of glass panels unchanged from the core audit

## Verification

```bash
npx vitest run tests/features/research-a11y
```

Service outputs, scores, and execution policy are unchanged by this pass.
