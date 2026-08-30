# Prepaid Meter Recharge Advisor

Solution for **LofiStack Hackathon 2026 — P10**

## Project information

- **Team:** `Candy Crush`
- **Team ID:** `LSH26-T015`
- **Problem:** `P10 — Prepaid Meter Recharge Advisor`
- **Live application:** <ADD LIVE URL BEFORE SUBMISSION>

> Judges will evaluate only the exact commit SHA entered in the Final Submission Form.

## Solution summary

The application rebuilds a prepaid electricity meter's balance day by day from raw unit
readings and a recharge history, correctly applying monthly slab pricing, VAT, and the
once-a-month demand charge and meter rent. It then answers the two questions a family
actually asks a meter for — when will the balance run out, and how much to recharge today
to last until a chosen date, broken down into energy, the higher-slab surcharge, fixed
charges and VAT — and compares two recharge habits (topping up when low vs. topping up
every month) over the same consumption to show which one costs less and by how much.

## Requirements

| Requirement                                                                          | Status   | Where to verify                                    |
| ------------------------------------------------------------------------------------- | -------- | --------------------------------------------------- |
| R1 — Household with 6+ months of daily readings and recharge history                  | Complete | `household_PUB-01.json`                              |
| R2 — Day-by-day balance rebuild with slab pricing, VAT, fixed charges, recharges shown | Complete | `tariff_engine.rebuild_ledger`, `PUB-01_balance_ledger.csv`, `PUB-01_balance_chart.png` |
| R3 — Run-out date and recharge-to-target amount with breakdown                        | Complete | `tariff_engine.project_runout_date`, `tariff_engine.recharge_needed`, `PUB-01_full_results.json` |
| R4 — Low-balance vs. monthly recharge habit comparison over 3 months                  | Complete | `tariff_engine.simulate_habit`, `PUB-01_full_results.json` |

## How to test the application

1. Open the live application (or run `run_demo.py` locally — see below).
2. Load the bundled household `household_PUB-01.json` (loaded automatically by `run_demo.py`).
3. Review the printed balance ledger and the generated `PUB-01_balance_chart.png` — every
   recharge is marked on the balance line with its amount.
4. Review the printed answers to the run-out date, the recharge-to-target breakdown, and the
   3-month habit comparison at the end of the run.

### Test or sample data

The published fixture is `household_PUB-01.json`, bundled in the repository. It contains six
months of daily unit readings (2026-01-01 to 2026-06-30) and 18 recharges, including a light
month (January), a heavy summer month (May), and a large last-week-of-the-month recharge
(June 25 and June 29). Re-running `run_demo.py` always starts fresh from this file and never
mutates it, so no reset step is required.

## Run locally

### Requirements

- Python 3.10+
- No database required (the household is a flat JSON fixture)
- `matplotlib` (for the balance chart)

### Setup

```bash
git clone <PUBLIC-REPOSITORY-URL>
cd lsh26-t015-p10
pip install matplotlib
python run_demo.py
```

Do not include real passwords, tokens or API keys. List only variable names in `.env.example`.

## Problem-solving approach

- The team read the tariff and the four required items and modelled the meter as a strict
  day-by-day ledger: every day deducts that day's units at the slab the **month's cumulative
  total reaches after** that day, plus 5% VAT on the energy amount; a recharge adds money and,
  only if it is the first recharge seen in that calendar month, also deducts the 42 BDT demand
  charge and 40 BDT meter rent.
- For "how much to recharge today", the team decomposed the future cost into a flat baseline
  (all units priced at the lowest slab) plus a separate "higher slab" surcharge, so the family
  can see exactly how much of the bill is caused by heavy usage pushing them into a higher slab.
- The most important design decision was keeping the habit comparison (R4) honest: both habits
  run the identical daily consumption and slab counter, so energy and VAT must come out equal
  by construction — the team added an automated check for this invariant.
- The solution was tested by hand-checking individual ledger rows against the tariff by hand
  (e.g. verifying the exact day the fixed charge is applied), and by running the habit
  comparison across all 25 published sample households to confirm every resulting cost
  difference is an exact multiple of 82.00 BDT (one demand charge + one meter rent) — never a
  fabricated slab-timing saving.

## Technology used

- **Frontend:** Not yet implemented (CLI/script output for this submission)
- **Backend:** Python (standard library + `matplotlib` for charting)
- **Database:** None — household data is a flat JSON fixture
- **Deployment:** Not yet deployed
- **Other material tools:** `matplotlib` for the balance chart

See [`LICENSES.md`](LICENSES.md) for third-party materials.

## Team contributions

| Registered member       | GitHub username                | Major contribution | Evidence                |
| ------------------------ | ------------------------------- | ------------------- | ------------------------ |
| Nahid Ibn Zaman           | `nahidzaman1996271-sketch`      | <Contribution>       | File, feature or commit |
| Farhan Ishraq Ifti        | `252-35-648-ops`                | <Contribution>       | File, feature or commit |
| Tahmid Hossain Pranjol    | `Tahmid-442`                    | <Contribution>       | File, feature or commit |
| Mahmuda Khanum            | `252-35-537-del`                | <Contribution>       | File, feature or commit |

Commit count alone does not represent contribution.

## AI usage

- **Claude (Anthropic):** Used to design and implement the tariff/billing engine
  (`tariff_engine.py`), the day-by-day ledger rebuild, the run-out-date and recharge-breakdown
  calculators, the habit-comparison simulator, the balance chart, and this documentation set.
  Output was verified by hand-checking individual ledger rows against the stated tariff (e.g.
  confirming the 82 BDT fixed charge lands only on the first recharge of a month), and by
  running the habit comparison across all 25 published sample households to confirm every cost
  difference is an exact multiple of 82.00 BDT, matching the clarification that timing cannot
  create a fabricated slab saving.

## Major design decisions

- **Decision:** Charge each day's units in full at the single slab the month's cumulative total
  reaches after that day (no splitting one day's units across two slabs) — chosen for a
  deterministic, auditable ledger that matches the plain reading of the problem statement.
- **Decision:** Apply the 42 BDT demand charge and 40 BDT meter rent strictly on the first
  recharge event of each calendar month (not on a fixed calendar date) — this is required by
  the problem statement and is also what makes the habit comparison in R4 meaningful.
- **Decision:** Break the "how much to recharge" answer into a flat baseline energy cost plus a
  separate higher-slab surcharge, so the family can see how much of their bill is caused by
  heavy usage rather than just the flat rate.

## Known limitations

- No live web frontend yet — the current submission demonstrates all four requirements via a
  Python script (`run_demo.py`) against the bundled household fixture.
- Only one household (`PUB-01`) is bundled and demonstrated end-to-end, though the engine has
  been validated against all 25 published sample households for the habit-comparison invariant.
- No deployment or persistence layer yet.

## Repository records

- [`EVENT.md`](EVENT.md) — event start code and pre-event-material declaration
- [`evaluation-manifest.json`](evaluation-manifest.json) — structured judging evidence
- [`LICENSES.md`](LICENSES.md) — frameworks, libraries, templates and assets
