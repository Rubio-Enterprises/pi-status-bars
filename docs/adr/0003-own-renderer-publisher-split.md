---
status: accepted
date: 2026-10-20
---

# Own renderer with a publisher/renderer split over pi.events

## Context and Problem Statement

Publishers need semantic forms, countdowns and elastic titles without taking over Pi's footer or editor. Existing shared renderers offer contribution surfaces but not the required semantic layout. Should publishers target an existing renderer or a contract owned here?

## Considered Options

- Own renderer with semantic publishers over pi.events.
- Adopt @juanibiapina/pi-powerbar: rejected because it truncates characters rather than selecting semantic forms and blanks Pi's footer.
- Adopt pi-zentui: rejected because it takes over the footer and editor and lacks the required semantic parts, countdowns and elastic titles.

## Decision Outcome

Chosen option: "Own renderer with semantic publishers over pi.events", because one renderer can own styling and semantic degradation while publishers supply state without replacing Pi's footer or editor.

## Consequences

- Good, because semantic parts and forms let the renderer fit segments without publishers drawing or clipping their own content.
- Bad, because this repository must maintain the renderer and public contract instead of reusing an existing package.
- Bad, because publishers have no drawing fallback and show nothing when the renderer is absent.
