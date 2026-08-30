# Third-Party Material and AI Disclosure

List material frameworks, libraries, starters, templates, UI kits, fonts, icons and assets used in this repository.

| Name | Version or source URL | Licence | Used for |
|---|---|---|---|
| Fraunces (Google Fonts) | <https://fonts.google.com/specimen/Fraunces> | SIL Open Font License 1.1 | Display/heading typeface |
| Inter (Google Fonts) | <https://fonts.google.com/specimen/Inter> | SIL Open Font License 1.1 | Body typeface |
| Space Mono (Google Fonts) | <https://fonts.google.com/specimen/Space+Mono> | SIL Open Font License 1.1 | Monospace/figures typeface |
| Node.js | <https://nodejs.org/> | MIT License | Local development testing only (not shipped in the app) |
| jsdom | <https://github.com/jsdom/jsdom> | MIT License | Headless DOM smoke-testing during development (not shipped in the app) |

## AI tools

- **Claude (Anthropic, Sonnet model), via claude.ai** — assisted with writing `engine.js` (tariff/ledger logic), `app.js` (UI rendering), `styles.css`, and the initial project scaffolding for `index.html`. Output was verified by porting the engine in parallel to an independent Python reference implementation and cross-checking every calculation figure-for-figure against it, then smoke-testing the rendered app against all 25 organizer fixture cases with a headless DOM (jsdom) to confirm no runtime errors and that both a genuine tie and a genuine cost difference occur in the habit comparison. See `evaluation-manifest.json` for the structured record.

## Original-work statement

Everything not declared in this file or `EVENT.md` was created by the registered team during the event window.
