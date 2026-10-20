# Agent context

This repo follows Rubio-Enterprises standards. Use `mise tasks` to discover commands;
`mise run lint`, `typecheck`, and `test` are the local checks. Generated lint configs belong
to standards; edit their `.local` sidecars and regenerate with `mise run lint-config`.

## Repository guidance

Scaffold only; the extension factory is a no-op. Renderer implementation lands separately.
Pi packages are host-provided `*` peers with exact 1.3.0 development pins.
Keep the Bun test runner's positive-count contract.
