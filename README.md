# Tidemark, proof of design

A clickable, front-end-only proof of design for a building protection
platform: devices in a customer's buildings report to our platform, which
turns readings into monitoring, managed alerts, reports and an auditable
incident record. It runs entirely in the browser on a deterministic mock
world with Australian demo data. Tidemark is a working name.

The brief is `Brief.md`. Design and data decisions are in `docs/`.

## Run it

```sh
npm install
npm run dev          # http://localhost:5173
npm run build        # static output in dist/, works offline
npx vite preview     # serve dist/
```

| Command | What it does |
| --- | --- |
| `npm test` | Unit tests: every invariant in the data specification, the hero loop through the engine, the October report reconciling |
| `npm run test:e2e` | Playwright end-to-end checks, including the hero loop by mouse and by keyboard alone (build first) |
| `npm run audit` | Palette validator, literal scan, axe on 16 screens in both themes, and the overflow check |
| `npm run shots` | Screenshots of key screens at 1920, 1440, 1024, 768 and 390 px in both themes |
| `node scripts/pdf.mjs <path> <out.pdf>` | Print a report to PDF the way a person would |

Playwright needs Chromium once: `npx playwright install chromium`.

## The demo tray

Press Shift+D, or use the button at the bottom right.

- **Clock**: 1x, 10x or 60x, and reset to Fri 20 Nov 2026, 07:48 AEDT.
- **Scenarios**: a burst main at 140 Wexford Street, a cool room door left
  open at Wattle Grove, gateway GW-04 offline at Ellery House Hotel, and a
  leak sensor that goes wet then dry at Lorne Road.
- **You are**: Helen (portfolio), Marcus (building manager), Tom (phone,
  opens the responder view) or Kayla (phone, opens commissioning).
- **Latest SMS**: the text Tom or Marcus received, with its link.
- **Customer**: Pemberton Hall, or Day one (an empty new customer).
- **Theme and density.**

Everything you do is kept for the session: reload any page and the demo
continues from the same moment. Reset clears it.

## Five-minute demo script

| Minute | Show | Point to make |
| --- | --- | --- |
| 0:00 | Open Portfolio as Helen. Read the briefing. | The 60-second test: which building, what, who, what cost. |
| 0:45 | Open Kendall Street Tower and its riser diagram. | One picture of the whole building, with the problem where it physically is. |
| 1:30 | Open the incident from the Watch bar. Evidence chart and escalation table. | Three alerts grouped into one incident. Every notification and its delivery result is on the record. |
| 2:15 | Acknowledge. Settings, Escalation: fix Marcus's number and send a test. | The platform finds roster gaps, not just leaks. |
| 3:00 | Dispatch Tom (ETA 25 min), set 60x, close XV-01, watch flow return, resolve once WL-B2-03 reads dry. | Detection through to resolution in one tool. |
| 3:45 | Export the incident report, then Reports, October 2026. | Evidence for owners and insurers. |
| 4:30 | In the tray choose Kayla, phone, and commission a device. | Installed in two minutes and verified before she leaves. |

## Screens

| Path | Screen |
| --- | --- |
| `/portfolio` | Briefing, ledger of 16 buildings, map |
| `/buildings/:id` | Riser diagram, live values, charts, devices, incidents, maintenance, details |
| `/incidents`, `/incidents/:id` | Incident list and the full record with actions |
| `/devices`, `/devices/:id` | Registry with health filters, device record |
| `/water` | Use against the usual, overnight baseline, anomalies, benchmarks |
| `/reports/monthly`, `/reports/incident/:id` | A4 documents, print to PDF |
| `/logbook` | Append-only record with CSV export |
| `/settings/*` | Escalation, rules, people, integrations, plan and billing |
| `/m/respond/:id`, `/r/:short` | Responder view, opened from the SMS link |
| `/m/commission` | Installer commissioning |
| `/dev/symbols`, `/dev/tokens` | Internal: symbol legend and tokens |

Ctrl K (Cmd K) searches buildings, incidents, devices, people and screens.

## Folder map

```text
src/
  brand.ts       working name, in one place
  tokens/        CSS custom properties (light and night), base and print styles
  domain/        types in two layers: ingestion and building protection
  api/           typed client, transport boundary, queries, live events
  mock/          the stand-in backend
    world/       buildings, topology and devices, people, rules
    signals/     readings as pure functions, effects, uplinks
    history/     the 90-day history and rainwater paths
    scenarios/   the demo clock and incidents open at 07:48
    engine/      rules, grouping, escalation, actions, triggers
    selectors/   every number the app shows
    server.ts    the mock REST routes
  shell/         top bar, Watch bar, tree, inspector, demo tray, search
  components/    glyphs, annunciator, tags, values, buttons, table, charts, symbols
  features/      the screens
  lib/           formatting, time zones, rule wording
docs/            design plan, notes, decisions, audit, data spec, API contract
scripts/         palette check, literal scan, axe, overflow, screenshots, PDF
e2e/             Playwright checks
screenshots/     per milestone and final
```

## Replacing the mock

The UI talks only to `src/api/transport.ts`. `docs/api-contract.md` lists every
REST endpoint, command and live event; a FastAPI backend that implements it can
replace `MockTransport` without changes to the screens.
