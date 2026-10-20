# pi-status-bars

[![standard-readme compliant](https://img.shields.io/badge/readme%20style-standard-brightgreen.svg?style=flat-square)](https://github.com/RichardLitt/standard-readme)

Shared renderer for semantic Pi status segments above and below the editor

Publishers supply state; this renderer owns two wrapping lines, styling, degradation and countdowns.
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
semantic parts, countdowns and elastic titles. [ADR-0002](docs/adr/0002-wrapping-lines-per-publisher-degradation.md)
records wrapping and per-publisher degradation.

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
  "lines": {
    "above": { "maxRows": 1 },
    "below": { "maxRows": 2 }
  },
  "segments": {
    "usage.gemini": { "priority": 5 },
    "exposure.summary": { "zone": "left", "order": 99 },
    "pr.extra-4": { "hidden": true }
  }
}
```

Lines wrap only as needed: defaults are one row above and two below. Set either
`lines.above.maxRows` or `lines.below.maxRows` to an integer 1–4; for example,
`{"lines":{"below":{"maxRows":3}}}` allows three below rows. Invalid values are ignored
(not clamped), warn once per entry/session, and retain that line's default. Unknown keys are ignored.
To opt into a single below row, use `{"lines":{"below":{"maxRows":1}}}`.

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

- Lines greedily wrap up to their row cap before degradation. Rows use visible columns,
  never string length; no blank rows are reserved.
- Pack left-zone segments by order then ID, followed by right-zone segments in that order;
  never reorder segments to fill gaps. Each row right-aligns its right zone with at least a three-column
  gap when both zones are present.
- A group is the segment ID prefix before the first dot. Its priority is the highest effective
  priority among its visible segments. Lowest-priority groups degrade first (ties: group name,
  ascending), all their segments in lockstep. Exhaust a group through minimal and dropping
  before touching the next group. Repack after every step.
- Once fitting, backfill in descending group priority (ties: group name ascending), one restore
  step per group per pass. Re-add its most recently dropped segment first (reverse drop order);
  only when none remain dropped, raise its shared detail level by one. Accept only steps that
  still fit the width and row cap using the same fixed countdown widths; otherwise revert.
  Leave every other group unchanged, and repeat until no step is accepted. Declared segment
  order stays intact; a rejected latest drop cannot be skipped for an older one.
- Packing omits elastic parts. Afterwards, one elastic part takes its own row's leftover width, truncating with `…`; fewer than eight columns omits it.
  If multiple publishers nominate one, only the first in left-zone/right-zone order receives space.
- Within the chosen group at minimal detail, lowest priority drops first; ties drop later order,
  then lexically later ID. Markers count toward packing and sit on the last row holding their zone's
  segments; an empty zone's marker goes at its position on the final row. Each zone appends dim `+N`, then themed `●<critical count> ●<warn count>` for dropped segments,
  using each segment's most severe full-form value/meter status and omitting zero counts.
  After segment dropping, warn counts shrink away before critical counts, then plain `+N` remains.
  A lone oversized segment finally truncates with `…`.
- Countdown packing reserves full/compact/terse/minimal widths of 8/7/4/0 columns. Rendering
  uses natural, unpadded text; ticks never change row assignment or group levels. Right alignment
  uses the natural rendered width. With the worked usage fixture at 167 columns, cap 2 keeps
  both groups full. Cap 1 drops exposure first, then compacts usage: full usage reserves 166
  columns and the right-zone marker needs another five, even though natural text is shorter.
  Backfill then restores compact exposure, removing the marker. At width 90/cap 2, usage stays
  compact and full exposure returns right-aligned on row 2. At width 60/cap 2, usage stays terse
  and full exposure returns on row 2. Backfill never sacrifices higher-priority detail.
- Default below-line drop order is exposure, gemini, chatgpt, claude (publisher priorities).
- Semantic styling uses Pi theme roles. Meters have six cells and disappear below compact;
  countdowns use the `dim` theme colour, full/compact durations, terse largest units,
  and disappear at minimal.
- One unreferenced 30-second clock runs only while rendered countdowns are visible.
  Hidden/dropped/minimal countdowns do not keep it alive.
- Reload and shutdown clear both lines, timers and subscriptions. No footer/header/status mutations.

## Development

```bash
mise run lint
mise run typecheck
mise run test
```

Tests include plain-theme layout goldens at 200/167/160/130/110/90/80/60/45/20 columns,
seeded layout and validation fuzz, row-cap configuration, backfill priority/reverse-drop/retry
and determinism tests, countdown stability and toggle tests.
Real Pi 1.3.0 SDK sessions cover both load orders, two-row rendering, replacement, clearing,
reload and shutdown.
The canonical Bun runner rejects zero tests and records positive-count proof for Test Gate.

## Contributing

Questions and bug reports belong in repository issues; pull requests are welcome.
Run the development checks and standards audit before submitting a Conventional Commit.
Treat the contract and segment IDs as public interfaces.

## License

[MIT](LICENSE) © 2026 Rubio-Enterprises.
