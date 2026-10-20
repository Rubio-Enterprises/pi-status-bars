# Wrapping lines with per-publisher degradation

This amends ADR-0001's one-row, line-wide lockstep rule. At the user's typical 167-column width, a low-priority exposure segment degraded high-priority usage, and more publishers are coming. Lines now greedily wrap up to a row cap (below 2, above 1 by default). Only then does the lowest-priority publisher group lower detail in lockstep and drop segments, exhausting that group before changing the next. A publisher "idle" flag was considered and deferred: it would not solve competition for space.

## Consequences

- Row caps are renderer configuration (integers 1–4); the publisher contract stays unchanged.
- Countdown widths are reserved per detail level so ticks cannot change packing or degradation; natural text remains unpadded.
- Elastic parts expand after packing on their own row. Zone-local overflow markers count toward packing.
