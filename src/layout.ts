import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
import { type Config, placement } from './config.ts';
import {
  DETAIL_LEVELS,
  type LineName,
  type Part,
  type Segment,
  type ZoneName,
} from './contract.ts';
import { joinParts, type PartTheme, renderPart } from './parts.ts';

export type DetailLevel = (typeof DETAIL_LEVELS)[number];

export function form(segment: Segment, level: DetailLevel): Part[] {
  let parts = segment.forms.full;
  for (const candidate of DETAIL_LEVELS) {
    parts = segment.forms[candidate] ?? parts;
    if (candidate === level) break;
  }
  return parts;
}

export interface LayoutResult {
  rows: string[];
  level: DetailLevel;
  dropped: string[];
  countdown: boolean;
}
interface Rendered {
  segment: Segment;
  place: ReturnType<typeof placement>;
  parts: Array<{ part: Part; text: string }>;
}

export function layout(
  segments: readonly Segment[],
  config: Config,
  line: LineName,
  width: number,
  now: number,
  theme: PartTheme,
  hyperlinks = false,
): LayoutResult {
  width = Number.isFinite(width) ? Math.max(0, Math.floor(width)) : 0;
  const collected = segments
    .map((segment) => ({ segment, place: placement(segment, config) }))
    .filter(({ place }) => place.line === line && !place.hidden)
    .sort((a, b) => a.place.order - b.place.order || compare(a.segment.id, b.segment.id));
  const dropped: string[] = [];
  const counts = {
    left: { total: 0, critical: 0, warn: 0 },
    right: { total: 0, critical: 0, warn: 0 },
  };
  let showWarn = true;
  let showCritical = true;
  let remaining = collected;
  let level: DetailLevel = 'full';
  let last: { text: string; countdown: boolean } = { text: '', countdown: false };

  const render = () => {
    let elastic: Rendered['parts'][number] | undefined;
    const rendered: Rendered[] = remaining.map(({ segment, place }) => ({
      segment,
      place,
      parts: form(segment, level).map((part) => ({
        part,
        text: renderPart(part, level, now, theme, hyperlinks),
      })),
    }));
    for (const zone of ['left', 'right'] as const) {
      for (const entry of rendered.filter((entry) => entry.place.zone === zone)) {
        for (const entryPart of entry.parts) {
          if ('elastic' in entryPart.part && entryPart.part.elastic) {
            elastic ??= entryPart;
            entryPart.text = '';
          }
        }
      }
    }
    const zoneText = (zone: ZoneName) => {
      const texts = rendered
        .filter((entry) => entry.place.zone === zone)
        .map((entry) => joinParts(entry.parts))
        .filter(Boolean);
      const count = counts[zone];
      if (count.total) {
        let marker = theme.fg('dim', `+${count.total}`);
        for (const status of ['critical', 'warn'] as const) {
          if (count[status] && (status === 'critical' ? showCritical : showWarn)) {
            marker += ` ${renderPart(
              { kind: 'value', text: `●${count[status]}`, status },
              level,
              now,
              theme,
              false,
            )}`;
          }
        }
        texts.push(marker);
      }
      return texts.join(theme.fg('dim', ' │ '));
    };
    const compose = (pad: boolean) => {
      const left = zoneText('left');
      const right = zoneText('right');
      const used = visibleWidth(left) + visibleWidth(right);
      if (left && right) return left + ' '.repeat(pad ? Math.max(3, width - used) : 3) + right;
      return right ? (pad ? ' '.repeat(Math.max(0, width - used)) : '') + right : left;
    };
    if (elastic) {
      const entry = elastic;
      const without = visibleWidth(compose(false));
      entry.text = renderPart(entry.part, level, now, theme, hyperlinks, 8);
      const overhead = visibleWidth(compose(false)) - without - visibleWidth(entry.text);
      const room = width - without - overhead;
      entry.text = room >= 8 ? renderPart(entry.part, level, now, theme, hyperlinks, room) : '';
    }
    return {
      text: compose(true),
      countdown: rendered.some((entry) =>
        entry.parts.some(({ part, text }) => part.kind === 'countdown' && !!text),
      ),
    };
  };

  if (!(width && remaining.length)) return { rows: [], level, dropped, countdown: false };
  for (const candidate of DETAIL_LEVELS) {
    level = candidate;
    last = render();
    if (visibleWidth(last.text) <= width) return result();
  }
  while (remaining.length > 1) {
    const victim = [...remaining].sort(
      (a, b) =>
        a.place.priority - b.place.priority ||
        b.place.order - a.place.order ||
        compare(b.segment.id, a.segment.id),
    )[0];
    if (!victim) break;
    dropped.push(victim.segment.id);
    const count = counts[victim.place.zone];
    count.total++;
    const status = overflowStatus(victim.segment);
    if (status) count[status]++;
    remaining = remaining.filter((entry) => entry !== victim);
    last = render();
    if (visibleWidth(last.text) <= width) return result();
  }
  showWarn = false;
  last = render();
  if (visibleWidth(last.text) <= width) return result();
  showCritical = false;
  last = render();
  return result();

  function result(): LayoutResult {
    const text = truncateToWidth(last.text, width, '…');
    return { rows: text ? [text] : [], level, dropped, countdown: last.countdown };
  }
}

function overflowStatus(segment: Segment): 'critical' | 'warn' | undefined {
  let status: 'warn' | undefined;
  for (const part of segment.forms.full) {
    if (part.kind !== 'value' && part.kind !== 'meter') continue;
    if (part.status === 'critical') return 'critical';
    if (part.status === 'warn') status = 'warn';
  }
  return status;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
