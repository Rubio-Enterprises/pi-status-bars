import { expect, test } from 'bun:test';
import { stripTerminalSequences, visibleWidth } from '@earendil-works/pi-tui';
import { parseConfig } from '../src/config.ts';
import { layout } from '../src/layout.ts';
import { now, plain, segment, text } from './fixture.ts';
import { fullUsage, realisticUsage } from './wrapping-fixture.ts';

test('width 167, default below cap 2: full usage then right-aligned full exposure', () => {
  const result = layout(realisticUsage(), new Map(), 'below', 167, now, plain);
  expect(result.rows).toEqual([
    fullUsage,
    `${' '.repeat(130)}exposure 2 tools off · 1 skill hidden`,
  ]);
  expect(result.dropped).toEqual([]);
  expect(result.levels).toEqual({ usage: 'full', exposure: 'full' });
});

const compactUsage =
  'claude 5h ╺────╴ 24% ↻2h18m | wk ╺━───╴ 25% ↻4d6h │ chatgpt wk ╶────╴ 5% ↻6d14h │ gemini 5h ╶────╴ 0% ↻4h57m | wk ╶────╴ 0% ↻6d23h';
test('width 167, cap 1: compact usage permits compact exposure backfill', () => {
  const config = parseConfig({ lines: { below: { maxRows: 1 } } }, () => {});
  expect(layout(realisticUsage(), config, 'below', 167, now, plain)).toEqual({
    rows: [`${compactUsage}${' '.repeat(18)}⊘ 2 tools · 1 skill`],
    levels: { usage: 'compact', exposure: 'compact' },
    dropped: [],
    countdown: true,
  });
  expect(layout(realisticUsage(), config, 'below', 171, now, plain)).toEqual({
    rows: [`${fullUsage + ' '.repeat(9)}⊘3`],
    levels: { usage: 'full', exposure: 'minimal' },
    dropped: [],
    countdown: true,
  });
});
test.each([
  {
    width: 90,
    rows: [
      'claude 5h ╺────╴ 24% ↻2h18m | wk ╺━───╴ 25% ↻4d6h │ chatgpt wk ╶────╴ 5% ↻6d14h',
      `gemini 5h ╶────╴ 0% ↻4h57m | wk ╶────╴ 0% ↻6d23h${' '.repeat(5)}exposure 2 tools off · 1 skill hidden`,
    ],
    usage: 'compact',
    exposure: 'full',
    dropped: [],
  },
  {
    width: 60,
    rows: [
      'claude 5h 24% | wk 25% │ chatgpt wk 5%',
      'gemini 5h 0% | wk 0%   exposure 2 tools off · 1 skill hidden',
    ],
    usage: 'terse',
    exposure: 'full',
    dropped: [],
  },
  {
    width: 45,
    rows: [
      'claude 5h 24% | wk 25% │ chatgpt wk 5%',
      'gemini 5h 0% | wk 0%      ⊘ 2 tools · 1 skill',
    ],
    usage: 'terse',
    exposure: 'compact',
    dropped: [],
  },
  {
    width: 20,
    rows: ['cl 5h 24% | wk 25%', 'gpt wk 5% │ +1    ⊘3'],
    usage: 'minimal',
    dropped: ['usage.gemini'],
  },
])('worked width $width, cap 2', (expected) => {
  const { width, rows, usage, dropped } = expected;
  const result = layout(realisticUsage(), new Map(), 'below', width, now, plain);
  expect(result.rows).toEqual([...rows]);
  expect(result.levels).toEqual({
    usage,
    exposure: expected.exposure ?? 'minimal',
  });
  expect(result.dropped).toEqual([...dropped]);
  expect(result.rows.length).toBeLessThanOrEqual(2);
  for (const row of result.rows) expect(visibleWidth(row)).toBeLessThanOrEqual(width);
});

test('clock width changes preserve row assignments and group levels at every level', () => {
  for (const width of [167, 90, 60, 45, 20]) {
    const before = layout(realisticUsage(), new Map(), 'below', width, now, plain);
    const after = layout(realisticUsage(), new Map(), 'below', width, now + 79 * 60_000, plain);
    expect(after.levels).toEqual(before.levels);
    expect(after.dropped).toEqual(before.dropped);
    expect(after.rows.map((row) => row.replace(/↻ ?[0-9dhm]+/g, 'CLOCK'))).toEqual(
      before.rows.map((row) => row.replace(/↻ ?[0-9dhm]+/g, 'CLOCK')),
    );
  }
});

test('greedy order is left then right, never reordered; no spare rows reserved', () => {
  const segments = [
    segment('a.second', { line: 'below', order: 20, forms: { full: [text('BBBBBB')] } }),
    segment('a.first', { line: 'below', order: 10, forms: { full: [text('AAAAAA')] } }),
    segment('b.right', { line: 'below', zone: 'right', order: 0, forms: { full: [text('R')] } }),
  ];
  expect(layout(segments, new Map(), 'below', 10, now, plain).rows).toEqual([
    'AAAAAA',
    'BBBBBB   R',
  ]);
  expect(layout(segments.slice(0, 1), new Map(), 'below', 10, now, plain).rows).toEqual(['BBBBBB']);
  expect(layout([], new Map(), 'below', 10, now, plain).rows).toEqual([]);
});

test('group priority is the highest effective visible priority; groups exhaust before the next changes', () => {
  const segments = [
    segment('a.high', {
      priority: 100,
      order: 10,
      forms: { full: [text('HHHH')], compact: [text('H')] },
    }),
    segment('a.low', {
      priority: 0,
      order: 20,
      forms: { full: [text('LLLL')], compact: [text('L')] },
    }),
    segment('b.mid', { priority: 50, forms: { full: [text('BBBBBBBB')] } }),
  ];
  expect(layout(segments, new Map(), 'above', 10, now, plain)).toMatchObject({
    rows: ['H │ L │ +1'],
    levels: { a: 'compact', b: 'minimal' },
    dropped: ['b.mid'],
  });
  const config = parseConfig({ segments: { 'a.high': { priority: 10 } } }, () => {});
  expect(layout(segments, config, 'above', 13, now, plain)).toMatchObject({
    rows: ['BBBBBBBB │ +2'],
    levels: { a: 'minimal', b: 'full' },
    dropped: ['a.low', 'a.high'],
  });
  const hidden = parseConfig({ segments: { 'a.high': { hidden: true } } }, () => {});
  expect(layout(segments, hidden, 'above', 13, now, plain)).toMatchObject({
    rows: ['BBBBBBBB │ L'],
    levels: { a: 'compact', b: 'full' },
    dropped: [],
  });
});
test('equal-priority groups exhaust in ascending group-name order', () => {
  const segments = ['b', 'a'].map((group) =>
    segment(`${group}.one`, {
      forms: { full: [text(group.repeat(5))] },
    }),
  );
  expect(layout(segments, new Map(), 'above', 10, now, plain)).toMatchObject({
    rows: ['bbbbb │ +1'],
    levels: { a: 'minimal', b: 'full' },
    dropped: ['a.one'],
  });
});
test('markers pack with the last segment of their zone; empty zones use the last row', () => {
  const segments = ['AAA', 'BBB', 'CCC'].map((value, order) =>
    segment(`keep.${order}`, {
      line: 'below',
      order,
      priority: 100,
      forms: { full: [text(value)] },
    }),
  );
  segments.push(
    segment('drop.right', {
      line: 'below',
      zone: 'right',
      forms: { full: [text('X'.repeat(20))] },
    }),
  );
  expect(layout(segments, new Map(), 'below', 10, now, plain)).toMatchObject({
    rows: ['AAA │ BBB', 'CCC     +1'],
    dropped: ['drop.right'],
    levels: { keep: 'full', drop: 'minimal' },
  });
  expect(layout(segments, new Map(), 'below', 15, now, plain)).toMatchObject({
    rows: ['AAA │ BBB', 'CCC          +1'],
    levels: { keep: 'full', drop: 'minimal' },
    dropped: ['drop.right'],
  });
  segments.push(
    segment('drop.left', { line: 'below', order: 99, forms: { full: [text('X'.repeat(20))] } }),
  );
  expect(layout(segments, new Map(), 'below', 13, now, plain).rows).toEqual([
    'AAA │ BBB',
    'CCC │ +1   +1',
  ]);
});
test('elastic expands on its own row only after greedy packing', () => {
  const config = parseConfig({ lines: { above: { maxRows: 2 } } }, () => {});
  const segments = [
    segment('a.first', { order: 1, forms: { full: [text('FIRST-FIRST')] } }),
    segment('a.second', {
      order: 2,
      forms: {
        full: [text('SECOND'), { kind: 'value', text: 'a long elastic title', elastic: true }],
      },
    }),
  ];
  expect(
    layout(segments, config, 'above', 16, now, plain).rows.map(stripTerminalSequences),
  ).toEqual(['FIRST-FIRST', 'SECOND a long e…']);
  expect(
    layout(segments, config, 'above', 15, now, plain).rows.map(stripTerminalSequences),
  ).toEqual(['FIRST-FIRST', 'SECOND a long …']);
  expect(layout(segments, config, 'above', 13, now, plain).rows).toEqual(['FIRST-FIRST', 'SECOND']);
});
test('right-zone countdown alignment uses natural width, not its reserved width', () => {
  const s = segment('a.clock', {
    line: 'below',
    zone: 'right',
    forms: { full: [text('R'), { kind: 'countdown', at: now + 138 * 60_000 }] },
  });
  expect(layout([s], new Map(), 'below', 12, now, plain).rows).toEqual(['   R ↻ 2h18m']);
  expect(layout([s], new Map(), 'below', 12, now + 79 * 60_000, plain).rows).toEqual([
    '     R ↻ 59m',
  ]);
});
