# pi-status-bars

[![standard-readme compliant](https://img.shields.io/badge/readme%20style-standard-brightgreen.svg?style=flat-square)](https://github.com/RichardLitt/standard-readme)

Shared renderer for semantic Pi status segments above and below the editor

Publishers supply state; this renderer owns two one-row lines, styling, shrinking and countdowns.
Pi's footer, header and other extensions' status texts remain unchanged.
Requires Pi 1.3.0; publishers have no drawing fallback when this renderer is absent.

## Table of Contents

- [Background](#background)
- [Install](#install)
- [Usage](#usage)
- [Configuration](#configuration)
- [Contract](#contract)
- [Design invariants](#design-invariants)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## Background

Read the [glossary](GLOSSARY.md) for line, segment, form, detail level, zone, part,
elastic part, publisher and renderer.
The [decision record](docs/adr/0001-own-renderer-publisher-split.md) explains why existing
statusline packages did not fit: they take over Pi's footer or lack shared detail levels,
semantic parts, countdowns and elastic titles.

## Install

Load a local checkout for one session:

```bash
bun install --frozen-lockfile
pi --extension ./src/index.ts
```

After the coordinated v1 release, install the private repository with authenticated Git access:

```bash
pi install git:github.com/Rubio-Enterprises/pi-status-bars@v1.0.0
```

Pi supplies the host SDK and terminal UI; TypeBox 1.3.27 validates publications at runtime.

## Usage

Press **alt+u** to hide or show every line. This process-lifetime toggle survives reload;
publishers continue collecting and publishing while hidden. Empty lines are removed.

A publisher registers its request listener in its extension factory, not in session start:

```typescript
import type { Publication } from 'pi-status-bars/contract';

const latest: Publication = {
  version: 1,
  publisher: 'example',
  segments: [{
    id: 'example.summary', line: 'below', zone: 'left', order: 10, priority: 20,
    forms: { full: [{ kind: 'label', text: 'example' }, { kind: 'value', text: 'ready', status: 'ok' }] },
  }],
};
const unsubscribe = pi.events.on('status-bars:request', () => {
  pi.events.emit('status-bars:publish', latest);
});
pi.on('session_start', () => pi.events.emit('status-bars:publish', latest));
pi.on('session_shutdown', () => {
  pi.events.emit('status-bars:publish', { version: 1, publisher: 'example', segments: [] });
  unsubscribe();
});
```

Keep the latest publication current and publish whenever state changes. Consumers use a pinned
git development dependency on this package and import contract types only.

## Configuration

Read-only global file: `join(getAgentDir(), 'status-bars.json')` (normally
`~/.pi/agent/status-bars.json`; honors Pi's agent-directory setting).
There is no project scope, pattern matching or named layout.

```json
{
  "segments": {
    "usage.gemini": { "priority": 5 },
    "exposure.summary": { "zone": "left", "order": 99 },
    "pr.extra-4": { "hidden": true }
  }
}
```

Exact segment IDs accept optional `line` (`above|below`), `zone` (`left|right`),
finite numeric `order` and `priority`, and boolean `hidden`. Omitted fields retain publisher defaults.
Unknown keys are ignored. Invalid entries are skipped with deduplicated warnings;
missing files mean no overrides, and unreadable/unparsable files mean empty overrides plus a warning.
The file is stat-cached by modification time and size and checked each render pass.
Changes appear on the next render/publication (or reload); no config watcher or disk writes.

## Contract

`pi-status-bars/contract` exports the TypeBox schemas, static types and constants:

- `CONTRACT_VERSION = 1`
- `PUBLISH_CHANNEL = 'status-bars:publish'`: `{ version: 1, publisher, segments }`
- `REQUEST_CHANNEL = 'status-bars:request'`: `{ version: 1 }`
- Detail levels: `full → compact → terse → minimal`.

Each publication **replaces** all previous segments from that publisher; `segments: []` clears it.
Session start clears the store, prepares lines, then requests fresh publications.
Both extension load orders work because listeners register in factories.

Publisher IDs match `^[a-z][a-z0-9-]*$` (maximum 32 characters). Segment IDs follow
`<publisher>.<name>`, match `^[a-z][a-z0-9-]*\.[a-z0-9][a-z0-9.-]*$`, and are at most
64 characters. IDs are public configuration keys: keep them stable.
Duplicate or incorrectly prefixed IDs reject the entire publication.

A segment declares `id, line, zone, order, priority, forms`. The `full` form is required;
missing forms reuse the next more detailed form.
Parts are `label`, `value` (optional status), `meter` (fraction 0–1 and status),
`countdown` (epoch milliseconds `at`), `note`, `link` (text and URL),
`diff` (nonnegative integer additions/deletions), or `separator`.
Statuses are `ok|warn|critical|muted`. Text-bearing parts may set `elastic: true`.
Limits: 16 segments per publication, 24 parts per form, 200 characters per text, 2048 per URL.
Control characters become spaces. Only HTTP(S) URLs can become terminal hyperlinks;
unsafe URLs render as plain text. Invalid payloads never throw and warn once per publisher/session.

## Design invariants

- Each line is at most one terminal row, measured in visible columns, never string length.
- All segments on a line lower detail together before any segment is dropped.
- Within each zone, order is ascending, then ID. With both zones present, the gap is at least
  three columns; the right zone is right-aligned.
- One elastic part takes leftover width, truncating with `…`; fewer than eight columns omits it.
  If multiple publishers nominate one, only the first in left-zone/right-zone order receives space.
- At minimal detail, lowest priority drops first; ties drop later order, then lexically later ID.
  Each zone appends a dim `+N` count. A lone oversized segment finally truncates with `…`.
- Default below-line drop order is exposure, gemini, chatgpt, claude (publisher priorities).
- Semantic styling uses Pi theme roles. Meters have six cells and disappear below compact;
  countdowns use full/compact durations, terse largest units, and disappear at minimal.
- One unreferenced 30-second clock runs only while rendered countdowns are visible.
  Hidden/dropped/minimal countdowns do not keep it alive.
- Reload and shutdown clear both lines, timers and subscriptions. No footer/header/status mutations.

## Development

```bash
mise run lint
mise run typecheck
mise run test
```

Tests include plain-theme layout goldens at 200/160/130/110/90/80/60/45/20 columns,
validation fuzz, config/clock/toggle tests and real Pi 1.3.0 SDK sessions in both load orders,
including replacement, clearing, reload and shutdown.
The canonical Bun runner rejects zero tests and records positive-count proof for Test Gate.

## Contributing

Questions and bug reports belong in repository issues; pull requests are welcome.
Run the development checks and standards audit before submitting a Conventional Commit.
Treat the contract and segment IDs as public interfaces.

## License

[MIT](LICENSE) © 2026 Rubio-Enterprises.
