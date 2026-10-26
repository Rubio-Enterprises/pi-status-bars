# Agent context

This repo follows Rubio-Enterprises standards. Use `mise tasks` to discover commands;
`mise run lint`, `typecheck`, and `test` are the local checks. Shared tool configs, tasks and
hooks come from the gitignored `.standards-config/` checkout: on a fresh clone run
`mise bootstrap --only repos,tools --yes` first. Put repository exceptions in each tool's own
Config Stub (`biome.jsonc`, `tsconfig.json`) or in `lefthook-local.yml`.

## Repository guidance

`src/index.ts` wires Pi lifecycle, lines and clock. `contract.ts` owns the public schemas;
`validate.ts` rejects and sanitizes publications. `config.ts` owns read-only overrides and the
single `placement()` function. `layout.ts` is pure layout; `parts.ts` owns semantic styling.
Use [GLOSSARY.md](GLOSSARY.md) vocabulary and preserve the
[renderer/publisher split](docs/adr/0001-own-renderer-publisher-split.md).

Invariants:

- Own only `status-bars.above` and `status-bars.below` editor-adjacent lines. Keep Pi's footer,
  header and all other extensions' status texts untouched.
- Validate whole publications, enforce publisher-prefixed unique IDs, sanitize controls,
  and restrict OSC 8 links to HTTP(S). Store semantic parts, not themed strings.
- The contract is frozen for v1. Publishers compile against its exported types in parallel;
  contract changes require coordinated approval.
- Greedily wrap within each line's row cap before degrading publisher groups in priority order.
  Keep each group in lockstep; exhaust it before the next. Once fitting, backfill in descending
  group priority (name ascending on ties): restore the latest drop first, otherwise raise one level;
  accept only fitting steps, retry to a fixed point, and leave other groups unchanged.
  Measure countdowns at fixed widths,
  keep zone-local overflow counts, and bound every row by visible terminal columns.
- Only one elastic part gets width, and only one unref clock runs for visible countdowns.
- Register bus listeners in the factory; session start clears state then requests publications.
  Shutdown is idempotent and releases both lines, the clock and the publication subscription.
- Read config through `getAgentDir()`, stat-cache it, and apply exact-ID overrides only.
  Missing config must retain stable cache identity to avoid render-refresh loops.
- Keep line rendering independent from headless publication handling and validation.

`tests/integration.test.ts` drives real Pi 1.3.0 SDK AgentSessions with inline publisher/renderer
factories. Keep both load orders, reload/shutdown cleanup, and plain-theme layout goldens at all
nine widths. Keep the Bun runner's positive-count contract.

Pi packages are host-provided `*` peers with exact 1.3.0 development pins, never runtime
dependencies. TypeBox 1.3.27 is the contract's runtime dependency. pi-core-kit (pinned to a
release tag) reads `status-bars.json`; `ConfigStore` keeps the warn-once policy and re-derives
overrides only when the read outcome changes.
