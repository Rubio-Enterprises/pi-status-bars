# Own renderer with a publisher/renderer split over pi.events

Extensions that show at-a-glance state (subscription usage, pull requests, capability exposure) publish semantic segments on Pi's in-process event bus, and this single renderer lays them out on one-row lines above and below the editor, owning all styling and shrinking. We built our own instead of adopting an existing statusline package, because the closest as-shipped options did not support what we needed. `@juanibiapina/pi-powerbar` truncates segments character by character instead of switching between forms at shared detail levels, draws only one line, and blanks Pi's footer. `pi-zentui` takes over the footer and editor. Neither offers semantic parts, countdowns, or elastic titles.

## Consequences

- Publishers never draw and have no fallback, so without this renderer they show nothing.
- The contract is a TypeBox schema owned here. Publishers import its types only, and the renderer validates every payload at runtime.
- Segment IDs are a public contract, because the override config names them.
