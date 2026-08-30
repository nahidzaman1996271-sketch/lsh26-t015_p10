# Third-Party Material and AI Disclosure

List material frameworks, libraries, starters, templates, UI kits, fonts, icons and assets used in this repository.

| Name         | Version or source URL                              | Licence | Used for                              |
| ------------ | --------------------------------------------------- | ------- | -------------------------------------- |
| Python       | <https://www.python.org> (3.10+)                     | PSF     | Billing engine and CLI script          |
| matplotlib   | <https://matplotlib.org>                             | BSD-3   | Rendering the balance line chart       |

## AI tools

- **Claude (Anthropic):** Used to design and implement the tariff/billing engine, the
  day-by-day ledger rebuild, the run-out-date and recharge-breakdown calculators, the
  habit-comparison simulator, the balance chart, and this documentation set. Output was
  verified by hand-checking ledger rows against the stated tariff and by running the habit
  comparison across all 25 published sample households to confirm no fabricated slab saving.
  See `evaluation-manifest.json` for the structured record.

## Original-work statement

Everything not declared in this file or `EVENT.md` was created by the registered team during the event window.
