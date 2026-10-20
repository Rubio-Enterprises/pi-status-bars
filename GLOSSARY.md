# Status bars

How Pi extensions show at-a-glance state in lines around the editor: extensions publish what to show, and one renderer decides how it is laid out.

## Language

**Footer**:
Pi's built-in rows at the very bottom of the screen, including the shared row of extension status texts. Not owned by the renderer.
_Avoid_: status line, statusline

**Line**:
A full-width flow of segments the renderer owns next to the editor, spanning up to its row cap.
_Avoid_: widget, bar, status line

**Segment**:
One self-contained piece of state shown on a line, such as one provider's usage or the exposure summary.
_Avoid_: widget, item, block, cell

**Form**:
One way of showing a segment at a given amount of detail. A segment offers several forms, from most to least detailed.
_Avoid_: variant, version, mode

**Detail level**:
One step on the shared scale, from full to minimal, that every segment in a group is shown at together. A group lowers detail only when its line exceeds its row cap.
_Avoid_: shrink step, tier, mode

**Row cap**:
The maximum number of terminal rows a line may occupy. Unneeded rows are not reserved.
_Avoid_: height, line count

**Group**:
Segments from the same publisher, sharing a detail level. Its priority is the highest priority among its visible segments.
_Avoid_: cohort, batch

**Priority**:
How long a group keeps its detail and a segment stays on its line when space runs out. The lowest-priority group degrades and drops segments first; dropped segments count in a `+N` marker.
_Avoid_: rank, weight, order

**Zone**:
The left or right end of a line that segments gather toward.
_Avoid_: side, area, slot

**Part**:
One piece of meaning inside a form, such as a label, a value, a meter, a note, or a link. It says what something is, never how it looks.
_Avoid_: token, span, chunk

**Elastic part**:
A part, such as a pull request title, that takes whatever width is left on its line and is cut short to fit.
_Avoid_: flex part, filler

**Publisher**:
An extension that supplies segments but never draws them.
_Avoid_: provider (that word means a model provider), source, contributor

**Renderer**:
The single extension that owns the lines and lays segments out on them.
_Avoid_: host, widget extension
