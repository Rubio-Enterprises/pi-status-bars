import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
import { type Config, maxRows, placement } from './config.ts';
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
  levels: Record<string, DetailLevel>;
  dropped: string[];
  countdown: boolean;
}
interface Entry {
  segment: Segment;
  place: ReturnType<typeof placement>;
  group: string;
}
interface Rendered extends Entry {
  parts: Array<{ part: Part; text: string; measured: string }>;
}
interface Row {
  entries: Rendered[];
  markers: Partial<Record<ZoneName, string>>;
}
type Counts = Record<ZoneName, { total: number; critical: number; warn: number }>;
const countdownWidths = { full: 8, compact: 7, terse: 4, minimal: 0 };

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
  const collected: Entry[] = segments
    .map((segment) => ({
      segment,
      place: placement(segment, config),
      group: segment.id.split('.')[0] ?? segment.id,
    }))
    .filter(({ place }) => place.line === line && !place.hidden)
    .sort(
      (a, b) =>
        compare(a.place.zone, b.place.zone) ||
        a.place.order - b.place.order ||
        compare(a.segment.id, b.segment.id),
    );
  let remaining = collected.slice();
  const levels: Record<string, DetailLevel> = Object.fromEntries(
    remaining.map(({ group }) => [group, 'full']),
  );
  const dropped: string[] = [];
  const counts: Counts = {
    left: { total: 0, critical: 0, warn: 0 },
    right: { total: 0, critical: 0, warn: 0 },
  };
  const cap = maxRows(config, line);
  let showWarn = true;
  let showCritical = true;
  const separator = theme.fg('dim', ' │ ');
  if (!(width && remaining.length)) return { rows: [], levels, dropped, countdown: false };

  function marker(zone: ZoneName): string {
    const count = counts[zone];
    if (!count.total) return '';
    let text = theme.fg('dim', `+${count.total}`);
    for (const status of ['critical', 'warn'] as const) {
      if (count[status] && (status === 'critical' ? showCritical : showWarn))
        text += ` ${renderPart(
          { kind: 'value', text: `●${count[status]}`, status },
          'minimal',
          now,
          theme,
          false,
        )}`;
    }
    return text;
  }

  function compose(row: Row, measured: boolean, pad: boolean): string {
    const zoneText = (zone: ZoneName) => {
      const texts = row.entries
        .filter((entry) => entry.place.zone === zone)
        .map((entry) =>
          joinParts(
            entry.parts.map(({ part, text, measured: reserved }) => ({
              part,
              text: measured ? reserved : text,
            })),
          ),
        )
        .filter(Boolean);
      if (row.markers[zone]) texts.push(row.markers[zone]);
      return texts.join(separator);
    };
    const left = zoneText('left'),
      right = zoneText('right');
    const used = visibleWidth(left) + visibleWidth(right);
    if (left && right) return left + ' '.repeat(pad ? Math.max(3, width - used) : 3) + right;
    return right ? (pad ? ' '.repeat(Math.max(0, width - used)) : '') + right : left;
  }

  function pack(): Row[] {
    const rendered: Rendered[] = remaining.map((entry) => {
      const level = levels[entry.group] ?? 'full';
      return {
        ...entry,
        parts: form(entry.segment, level).map((part) => {
          const elastic = 'elastic' in part && part.elastic;
          const text = elastic ? '' : renderPart(part, level, now, theme, hyperlinks);
          return {
            part,
            text,
            measured: part.kind === 'countdown' ? ' '.repeat(countdownWidths[level]) : text,
          };
        }),
      };
    });
    const tails = {
      left: rendered.filter((entry) => entry.place.zone === 'left').at(-1) ?? rendered.at(-1),
      right: rendered.filter((entry) => entry.place.zone === 'right').at(-1) ?? rendered.at(-1),
    };
    const rows: Row[] = [];
    for (const entry of rendered) {
      const markers: Row['markers'] = {};
      for (const zone of ['left', 'right'] as const) {
        if (entry === tails[zone] && counts[zone].total) markers[zone] = marker(zone);
      }
      let row = rows.at(-1);
      if (!row) {
        row = { entries: [], markers: {} };
        rows.push(row);
      }
      const trial: Row = {
        entries: [...row.entries, entry],
        markers: { ...row.markers, ...markers },
      };
      if (row.entries.length && visibleWidth(compose(trial, true, false)) > width) {
        rows.push({ entries: [entry], markers });
      } else {
        row.entries.push(entry);
        Object.assign(row.markers, markers);
      }
    }
    return rows;
  }

  const fits = (rows: Row[]) =>
    rows.length <= cap && rows.every((row) => visibleWidth(compose(row, true, false)) <= width);
  let packed = pack();
  while (!fits(packed)) {
    const groups = new Map<string, number>();
    for (const entry of remaining)
      groups.set(entry.group, Math.max(groups.get(entry.group) ?? -Infinity, entry.place.priority));
    const group = [...groups].sort((a, b) => a[1] - b[1] || compare(a[0], b[0]))[0]?.[0];
    if (!group) break;
    const level = levels[group] ?? 'full';
    if (level !== 'minimal') {
      levels[group] = DETAIL_LEVELS[DETAIL_LEVELS.indexOf(level) + 1] ?? 'minimal';
    } else if (remaining.length > 1) {
      const victim = remaining
        .filter((entry) => entry.group === group)
        .sort(
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
    } else break;
    packed = pack();
  }
  if (!fits(packed)) {
    showWarn = false;
    packed = pack();
  }
  if (!fits(packed)) {
    showCritical = false;
    packed = pack();
  }

  if (fits(packed)) {
    const priorities = new Map<string, number>();
    for (const entry of collected)
      priorities.set(
        entry.group,
        Math.max(priorities.get(entry.group) ?? -Infinity, entry.place.priority),
      );
    const groups = [...priorities].sort((a, b) => b[1] - a[1] || compare(a[0], b[0]));
    let accepted: boolean;
    do {
      accepted = false;
      for (const [group] of groups) {
        const restore = [...dropped]
          .reverse()
          .map((id) => collected.find((entry) => entry.segment.id === id))
          .find((entry) => entry?.group === group);
        const level = levels[group] ?? 'full';
        if (!restore && level === 'full') continue;
        const previous = remaining;
        let dropIndex = -1;
        if (restore) {
          dropIndex = dropped.indexOf(restore.segment.id);
          dropped.splice(dropIndex, 1);
          remaining = collected.filter((entry) => !dropped.includes(entry.segment.id));
          const count = counts[restore.place.zone];
          count.total--;
          const status = overflowStatus(restore.segment);
          if (status) count[status]--;
        } else {
          levels[group] = DETAIL_LEVELS[DETAIL_LEVELS.indexOf(level) - 1] ?? 'full';
        }
        const trial = pack();
        if (fits(trial)) {
          packed = trial;
          accepted = true;
        } else {
          remaining = previous;
          levels[group] = level;
          if (restore) {
            dropped.splice(dropIndex, 0, restore.segment.id);
            const count = counts[restore.place.zone];
            count.total++;
            const status = overflowStatus(restore.segment);
            if (status) count[status]++;
          }
        }
      }
    } while (accepted);
  }

  let elasticAssigned = false;
  let countdown = false;
  const rows = packed
    .slice(0, cap)
    .map((row) => {
      for (const entry of row.entries) {
        for (const part of entry.parts) {
          if (!('elastic' in part.part && part.part.elastic) || elasticAssigned) continue;
          elasticAssigned = true;
          const level = levels[entry.group] ?? 'full';
          const without = visibleWidth(compose(row, false, false));
          part.text = renderPart(part.part, level, now, theme, hyperlinks, 8);
          const overhead =
            visibleWidth(compose(row, false, false)) - without - visibleWidth(part.text);
          const room = width - without - overhead;
          part.text = room >= 8 ? renderPart(part.part, level, now, theme, hyperlinks, room) : '';
        }
      }
      const natural = compose(row, false, true);
      const text = truncateToWidth(natural, width, '…');
      countdown ||= row.entries.some((entry) =>
        entry.parts.some((part) => {
          if (part.part.kind !== 'countdown' || !part.text) return false;
          const start = natural.indexOf(part.text);
          return (
            start >= 0 &&
            visibleWidth(natural.slice(0, start)) < visibleWidth(text.replace(/…$/, ''))
          );
        }),
      );
      return text;
    })
    .filter(Boolean);
  return { rows, levels, dropped, countdown };
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
