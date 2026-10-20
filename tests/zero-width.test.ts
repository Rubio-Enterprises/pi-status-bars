import { expect, test } from 'bun:test';
import { stripTerminalSequences, visibleWidth } from '@earendil-works/pi-tui';
import { parseConfig } from '../src/config.ts';
import { DETAIL_LEVELS } from '../src/contract.ts';
import { layout } from '../src/layout.ts';
import { now, plain, segment, text } from './fixture.ts';

const zeroWidths = ['', '\u200d', '\u200b', '\u0301', '\u0308\u0301'];

test.each(zeroWidths)('zero-width form %j cannot truncate a full-width neighbor', (value) => {
  expect(visibleWidth(value)).toBe(0);
  const segments = [
    segment('low.one', { order: 0, priority: 0, forms: { full: [text(value)], compact: [] } }),
    segment('high.one', { priority: 100, forms: { full: [text('ABCDEF')] } }),
  ];
  const result = layout(segments, new Map(), 'above', 6, now, plain);
  expect(result.rows).toEqual(['ABCDEF']);
  expect(result.levels.high).toBe('full');
  expect(result.dropped).toEqual([]);
});

test.each(zeroWidths)('zero-width form %j reserves no row or zone gap', (value) => {
  const segments = [
    segment('empty.left', { forms: { full: [text(value)] } }),
    segment('empty.right', { zone: 'right', forms: { full: [text(value)] } }),
  ];
  expect(layout(segments, new Map(), 'above', 6, now, plain).rows).toEqual([]);
  for (const zone of ['left', 'right'] as const) {
    const visible = segment('keep.one', { zone, forms: { full: [text('ABCDEF')] } });
    expect(layout([...segments, visible], new Map(), 'above', 6, now, plain).rows).toEqual([
      'ABCDEF',
    ]);
  }
});

test.each(zeroWidths)('zero-width form %j cannot move a zone marker', (value) => {
  const config = parseConfig({ lines: { above: { maxRows: 2 } } }, () => {});
  const segments = [
    segment('keep.left', {
      priority: 100,
      forms: { full: [text('LEFTLEFT')], compact: [text('L')] },
    }),
    segment('drop.one', { priority: 0, forms: { full: [text('X'.repeat(100))] } }),
    segment('keep.right', {
      zone: 'right',
      priority: 100,
      forms: { full: [text('RIGHT')] },
    }),
    segment('empty.tail', { order: 99, forms: { full: [text(value)] } }),
  ];
  expect(layout(segments, config, 'above', 10, now, plain).rows).toEqual(['L │ +1', '     RIGHT']);
});

test.each(zeroWidths)(
  'zero-width form %j leaves marker-only rows independent of entries',
  (value) => {
    for (const zone of ['left', 'right'] as const) {
      const result = layout(
        [
          segment('empty.one', { priority: 100, forms: { full: [text(value)] } }),
          segment('drop.one', { zone, priority: 0, forms: { full: [text('X'.repeat(100))] } }),
        ],
        new Map(),
        'above',
        6,
        now,
        plain,
      );
      expect(result.rows).toEqual([zone === 'left' ? '+1' : '    +1']);
      expect(result.dropped).toEqual(['drop.one']);
    }
  },
);

test('seeded zero-width fuzz: fitting full forms compose without hidden truncation', () => {
  let seed = 0x200d;
  const random = (limit: number) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return Math.floor((seed / 0x1_0000_0000) * limit);
  };
  for (let trial = 0; trial < 400; trial++) {
    const cap = 1 + random(4);
    const width = 1 + random(40);
    const config = parseConfig({ lines: { above: { maxRows: cap } } }, () => {});
    const segments = Array.from({ length: 1 + random(cap) }, (_, i) =>
      segment(`keep.s${i}`, {
        order: i,
        zone: random(2) ? 'left' : 'right',
        forms: { full: [text(String.fromCharCode(65 + i).repeat(1 + random(width)))] },
      }),
    );
    const expected: string[] = [];
    let left = '',
      right = '';
    const flush = () => {
      if (right) expected.push(left + ' '.repeat(width - left.length - right.length) + right);
      else if (left) expected.push(left);
      left = right = '';
    };
    for (const zone of ['left', 'right'] as const) {
      for (const entry of segments.filter((entry) => entry.zone === zone)) {
        const part = entry.forms.full[0];
        if (!(part && 'text' in part)) throw new Error('Missing text');
        const used = left.length + right.length + (left && right ? 3 : 0);
        if (used && used + 3 + part.text.length > width) flush();
        if (zone === 'left') left += (left ? ' │ ' : '') + part.text;
        else right += (right ? ' │ ' : '') + part.text;
      }
    }
    flush();
    const empty = Array.from({ length: 1 + random(10) }, (_, i) =>
      segment(`empty.s${i}`, {
        order: random(5),
        zone: random(2) ? 'left' : 'right',
        forms: { full: [text(zeroWidths[random(zeroWidths.length)] ?? '')] },
      }),
    );
    const result = layout([...segments, ...empty], config, 'above', width, now, plain);
    expect(result.rows).toEqual(expected);
    expect(result.levels).toEqual({ keep: 'full', empty: 'full' });
    expect(result.dropped).toEqual([]);
    expect(result.rows.length).toBeLessThanOrEqual(cap);
    for (const row of result.rows) expect(visibleWidth(row)).toBeLessThanOrEqual(width);
  }
});

test('seeded zero-width fuzz: composition matches packing with absent forms', () => {
  let seed = 0x20_0d_20_0b;
  const random = (limit: number) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return Math.floor((seed / 0x1_0000_0000) * limit);
  };
  const words = [...zeroWidths, 'A', 'BC', 'DEFGHI', 'J'.repeat(30)];
  for (let trial = 0; trial < 800; trial++) {
    const cap = 1 + random(4);
    const width = 1 + random(40);
    const line = random(2) ? 'above' : 'below';
    const config = parseConfig({ lines: { [line]: { maxRows: cap } } }, () => {});
    const segments = Array.from({ length: 1 + random(16) }, (_, i) =>
      segment(`g${random(4)}.s${i}`, {
        line,
        zone: random(2) ? 'left' : 'right',
        order: random(5),
        priority: random(5),
        forms: {
          full: [],
          ...Object.fromEntries(
            DETAIL_LEVELS.map((level) => [level, [text(words[random(words.length)] ?? '')]]),
          ),
        },
      }),
    );
    const absent = segments.map((entry) => ({
      ...entry,
      forms: Object.fromEntries(
        Object.entries(entry.forms).map(([level, parts]) => [
          level,
          parts.filter((part) => 'text' in part && visibleWidth(part.text) > 0),
        ]),
      ) as typeof entry.forms,
    }));
    const theme = {
      ...plain,
      fg: (_role: Parameters<typeof plain.fg>[0], value: string) =>
        trial % 2 ? value : `\u001b[32m${value}\u001b[0m`,
    };
    const result = layout(segments, config, line, width, now, theme);
    expect(result).toEqual(layout(absent, config, line, width, now, theme));
    expect(result.rows.length).toBeLessThanOrEqual(cap);
    for (const row of result.rows) {
      expect(visibleWidth(row)).toBeLessThanOrEqual(width);
      expect(stripTerminalSequences(row)).not.toMatch(/\u200b|\u200d|\u0301|\u0308/);
    }
  }
});
