# Tidemark, proof of design

A clickable, front-end-only proof of design for a building protection
platform. Runs entirely in the browser from a deterministic mock data layer.
Tidemark is a working name.

The brief is `Brief.md`. Design decisions are in `docs/`.

## Run it

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # static output in dist/, works offline
npm test           # unit tests (Vitest)
npm run test:e2e   # end-to-end checks (Playwright; run npm run build first)
npm run shots      # screenshots at 1440 and 390 px in both themes (build first)
npm run palette    # re-validates the colour tokens with the dataviz validator
```

Playwright needs Chromium once: `npx playwright install chromium`.

## Demo tray

Press Shift+D, or use the button in the bottom-right corner. It sets the clock
speed (1x, 10x, 60x), resets to the 07:48 start, and switches theme and
density. Scenario triggers and roles arrive in later milestones.

## Internal pages

- `/dev/tokens`: colours, type scale and the primitives in the current theme.
- `/dev/symbols`: the schematic symbol legend.

## Folder map

```text
src/
  brand.ts       working name, in one place
  tokens/        CSS custom properties (light and night), base styles
  domain/        shared types and vocabulary
  api/           typed client and the transport boundary (mock today)
  mock/          seeded world, scenarios, selectors, the mock router
  state/         demo clock and UI preferences
  shell/         top bar, Watch bar, asset tree, inspector, demo tray
  components/    status glyphs, annunciator, tag, value, buttons, table, symbols
  features/      the screens (built milestone by milestone)
  dev/           internal token and symbol pages
docs/            design plan, notes, decisions, API contract
scripts/         palette check and screenshot runner
e2e/             Playwright checks
screenshots/     captured screens per milestone
```

## Status

M0 design plan and M1 foundations are done. The five-minute demo script is
added when the screens it walks through exist.
