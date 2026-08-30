# Prepaid Meter Recharge Advisor

Solution for **LofiStack Hackathon 2026 — P10**

## Project information

- **Team:** `Candy Crush`
- **Team ID:** `LSH26-T015`
- **Problem:** `P10 — Prepaid Meter Recharge Advisor`
- **Live application:** https://nahidzaman1996271-sketch.github.io/lsh26-t015_p10/?fbclid=IwY2xjawUBK1BwZG9mBWV4dG4DYWVtAjEwAGJyaWQRMUFUaUJqODZZSHVSWEd2bk5zcnRjBmFwcF9pZBAyMjIwMzkxNzg4MjAwODkyAAEebBwC-cW_Deh3MUDMCsjhK3ObUgf6bdTHVF0lcPA1UuObZFbbxd6AEB8d3FI_aem_lgaO73IruBvNub9rggOiQQ

> Judges will evaluate only the exact commit SHA entered in the Final Submission Form.

## Solution summary

A household-facing tool that rebuilds a prepaid electricity meter's balance day by day from six months of unit readings and recharge history, then answers the two questions a family actually asks: when will the balance run out at the usual daily use, and how much needs to be recharged today to last until a chosen date. It also compares two recharge habits — topping up big whenever the balance runs low versus recharging a fixed amount on the 1st of every month — over the same three months of consumption, so a family can see which habit actually costs less and why.

## Requirements

| Requirement | Status | Where to verify |
| --- | --- | --- |
| R1 — Household with 6+ months of daily readings and recharge history, including a light month, a heavy summer month and a large last-week recharge | Complete | Section `01 — Six months on the meter`; data sourced from the organizer's public fixture (`data.js`), selectable via the case dropdown in the header |
| R2 — Day-by-day balance rebuild under the tariff (slab priced on running total, demand charge + meter rent on first recharge of the month, VAT on energy, balance line with every recharge marked) | Complete | Section `02 — Balance, rebuilt day by day`; logic in `engine.js` → `buildLedger()` |
| R3 — Answer run-out date and required recharge (broken into energy, higher-slab uplift, fixed charges, VAT) for a user-chosen target date | Complete | Section `03 — Ask the meter`; logic in `engine.js` → `projectRunOutDate()` and `requiredRecharge()` |
| R4 — Compare low-balance vs. monthly recharge habits over the same 3 months and consumption, showing which costs less and by how much | Complete | Section `04 — Two recharge habits, same consumption`; logic in `engine.js` → `compareHabits()` |

## How to test the application

1. Open the live application (or `merged.html` locally).
2. Use the **Household case** dropdown in the header to switch between the 25 published fixture households (defaults to `PUB-01`).
3. Scroll through sections 01–04 in order: household overview, the day-by-day ledger with its balance chart, the two "ask the meter" calculators (pick any date in the **Last until** field and press **Recalculate**), and the habit comparison for the case's three comparison months.
4. Expected result: every figure updates consistently for the selected case, the four recharge-breakdown numbers always sum to the "recharge today" figure shown, and the comparison verdict states plainly whether the two habits tied or which one was cheaper and by how much.

### Test or sample data

The organizer's published P10 fixture (all 25 cases) is embedded directly in `data.js` — nothing is synthesized. Switching the case dropdown reloads all four sections from that case's own `days`, `recharges`, `today`, `usual_daily_units`, `target_date` and `comparison` fields. There is no data-entry or save state to reset: the app is stateless and always recomputes straight from the fixture, so simply reselecting a case (or reloading the page) restores the initial view.

## Run locally

### Requirements

- Any modern web browser (no build step, no runtime install)
- Optional: Python 3 or Node.js, only if you'd rather serve the folder than open the file directly

### Setup

```bash
git clone <https://github.com/nahidzaman1996271-sketch/lsh26-t015_p10>
cd lsh26-t015-p10
# no install step — open index.html directly, or serve the folder:
python3 -m http.server 8000
# then open http://localhost:8000/index.html
```

`merged.html` is a single self-contained file with the same app inlined; it can be opened directly with no server at all.

Do not include real passwords, tokens or API keys. List only variable names in `.env.example`.

## Problem-solving approach

The brief centers on one tariff rule that's easy to get subtly wrong: units are priced by the slab the *month's running total* reaches, not per-unit, and demand charge/meter rent are tied to a *recharge event*, not to the calendar date. We treated `engine.js` as the single source of truth for that rule and built everything else (chart, ledger table, calculators, comparison) as pure views over its output, so every number on screen traces back to one deterministic function. The most important decision was keeping the two recharge-habit simulations built on identical daily consumption and an identical calendar-month slab counter, so any cost gap between them could only come from how many months triggered a first-recharge fixed charge — never from a fabricated energy-rate saving. The engine was verified by porting it in parallel to a Python reference implementation, cross-checking every figure (ledger balances, run-out date, recharge breakdown, habit comparison) against it, then smoke-testing the full rendered app against all 25 fixture cases to confirm no runtime errors and that at least one genuine tie and one genuine cost gap actually occur across the set.

## Technology used

- **Frontend:** Vanilla JavaScript, HTML5 Canvas (balance charts), CSS3 (Google Fonts: Fraunces, Inter, Space Mono)
- **Backend:** None — fully client-side, static app
- **Database:** None — organizer fixture embedded as JSON in `data.js`
- **Deployment:** <render.com>
- **Other material tools:** Node.js + jsdom (used only for local testing during development; not shipped in the app)

See [`LICENSES.md`](LICENSES.md) for third-party materials.

## Team contributions

| Registered member | GitHub username | Major contribution | Evidence |
| --- | --- | --- | --- |
| Nahid Ibn Zaman | `nahidzaman1996271-sketch` | Repository structure, GitHub Pages deployment, and submission logistics |35460da2f58a26862dd222c072c7212bb6578312 |
| Farhan Ishraq Ifti | `252-35-648-ops` | Documentation and evidence — wrote `EVENT.md`, `README.md`, `LICENSES.md`, and `evaluation-manifest.json` | `d067c74`, `9f50d6f`, `98a898e`, `5306979`, `6d1d526`, `9257fb3` |
| Tahmid Rashid Pranjol | `Tahmid-442` | QA — tested all four required hard-edge cases against the live app, cross-checked checking lists and trace output against the fixture data, and verified the requirement-by-requirement proof | `README.md` (proof table), `smoke_test.js` |
| Mahmuda Khanum | `252-35-537-del` | The grading engine and report UI — designed and implemented the core logic, prompted, reviewed, and iterated with Claude, and verified generated code against the brief's rules | `engine.js`, `app.js`, `data.js` |

Commit count alone does not represent contribution.

## AI usage

- **Tool:** Claude (Anthropic, Sonnet model), via claude.ai — assisted with writing `engine.js` (tariff/ledger logic), `app.js` (UI rendering), `styles.css`, and the initial project scaffolding for `index.html`.
- **Verification:** The JavaScript engine was ported in parallel to an independent Python reference implementation; every calculation (day-by-day ledger, run-out projection, required-recharge breakdown, habit comparison) was cross-checked figure-for-figure against it. The rendered app was then smoke-tested against all 25 cases in the organizer fixture using a headless DOM (jsdom) to confirm no runtime errors and that both a genuine tie and a genuine cost difference occur in the habit comparison across the case set, ruling out a hard-coded or trivially-always-equal result.

## Major design decisions

- **Decision:** Demand charge + meter rent are deducted only when a recharge actually happens to be the first one of that calendar month, not automatically when the month begins — because the brief specifies the charge is "taken on the first recharge of each month," and this is what makes the habit comparison in R4 meaningful rather than automatic.
- **Decision:** Each day's units are priced entirely at the slab the month's *ending* running total reaches for that day (not split across slab boundaries within a day) — the simplest reading of "charge each day's units at the slab the month's running total has reached" that keeps the slab counter identical regardless of recharge timing, per the brief's own clarification.
- **Decision:** When a user's chosen target date needs less money than the tariff cost for that period because a balance already sits on the meter, that existing balance is netted off proportionally across all four cost categories, so the four displayed components (energy, slab uplift, fixed charges, VAT) always sum exactly to the "recharge today" figure asked for in R3.

## Known limitations

- No live deployment URL has been added yet — update the **Live application** field above before submission.
- The comparison in section 04 uses the case's own actual daily readings for its three comparison months (`comparison.source: "readings"`); it does not yet support a manually supplied flat daily-units figure for that section.
- Team contribution evidence (file/feature/commit references) has not been filled in yet — see the table above.

## Repository records

- [`EVENT.md`](EVENT.md) — event start code and pre-event-material declaration
- [`evaluation-manifest.json`](evaluation-manifest.json) — structured judging evidence
- [`LICENSES.md`](LICENSES.md) — frameworks, libraries, templates and assets
