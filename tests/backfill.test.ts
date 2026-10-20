import { expect, test } from 'bun:test';
import { layout } from '../src/layout.ts';
import { now, plain, segment, text } from './fixture.ts';
import { realisticUsage } from './wrapping-fixture.ts';

test('backfill never lowers a higher-priority group to restore lower-priority detail', () => {
  const segments = [
    segment('high.one', {
      priority: 100,
      forms: {
        full: [text('HHHHHHHHHH')],
        compact: [text('H')],
      },
    }),
    segment('low.one', {
      priority: 1,
      forms: {
        full: [text('LLLLLLLLLL')],
        minimal: [text('L')],
      },
    }),
  ];
  expect(layout(segments, new Map(), 'above', 12, now, plain)).toMatchObject({
    rows: ['H │ L'],
    levels: { high: 'compact', low: 'minimal' },
    dropped: [],
  });
});

test('backfill retries a rejected higher group after a lower restore removes marker overhead', () => {
  const segments = [
    segment('high.one', {
      priority: 100,
      forms: {
        full: [text('HHHHHHHHHH')],
        compact: [text('H')],
      },
    }),
    segment('low.one', {
      priority: 1,
      forms: {
        full: [text('LLLLLLLLLL')],
        minimal: [text('L')],
      },
    }),
  ];
  expect(layout(segments, new Map(), 'above', 14, now, plain)).toMatchObject({
    rows: ['HHHHHHHHHH │ L'],
    levels: { high: 'full', low: 'minimal' },
    dropped: [],
  });
});

test('backfill restores dropped segments before raising the group level, preserving declared order', () => {
  const segments = [
    segment('high.one', {
      priority: 100,
      forms: {
        full: [text('H'.repeat(25))],
        compact: [text('H'.repeat(10))],
      },
    }),
    segment('low.first', {
      order: 10,
      priority: 1,
      forms: {
        full: [text('A'.repeat(100))],
        minimal: [text('A')],
      },
    }),
    segment('low.second', {
      order: 20,
      priority: 0,
      forms: {
        full: [text('B'.repeat(100))],
        minimal: [text('B')],
      },
    }),
  ];
  expect(layout(segments, new Map(), 'above', 20, now, plain)).toMatchObject({
    rows: ['HHHHHHHHHH │ A │ B'],
    levels: { high: 'compact', low: 'minimal' },
    dropped: [],
  });
});

test('a rejected most-recent drop blocks older drops in the same group, even if an older one fits', () => {
  const segments = [
    segment('high.one', {
      priority: 100,
      forms: {
        full: [text('H'.repeat(25))],
        compact: [text('H'.repeat(10))],
      },
    }),
    segment('low.first', {
      order: 10,
      priority: 1,
      forms: {
        full: [text('A'.repeat(100))],
        minimal: [text('A')],
      },
    }),
    segment('low.second', {
      order: 20,
      priority: 0,
      forms: {
        full: [text('B'.repeat(100))],
        minimal: [],
      },
    }),
  ];
  expect(layout(segments, new Map(), 'above', 17, now, plain)).toMatchObject({
    rows: ['HHHHHHHHHH │ +2'],
    levels: { high: 'compact', low: 'minimal' },
    dropped: ['low.second', 'low.first'],
  });
});

test.each([
  { bPriority: 1, row: 'H │ AAAA │ B', a: 'full', b: 'minimal' },
  { bPriority: 2, row: 'H │ A │ BBBB', a: 'minimal', b: 'full' },
])(
  'backfill visits descending group priority, then ascending name: $bPriority',
  ({ bPriority, row, a, b }) => {
    const segments = [
      segment('high.one', {
        order: 0,
        priority: 100,
        forms: {
          full: [text('H'.repeat(20))],
          compact: [text('H')],
        },
      }),
      segment('a.one', {
        order: 10,
        priority: 1,
        forms: {
          full: [text('AAAA')],
          minimal: [text('A')],
        },
      }),
      segment('b.one', {
        order: 20,
        priority: bPriority,
        forms: {
          full: [text('BBBB')],
          minimal: [text('B')],
        },
      }),
    ];
    expect(layout(segments, new Map(), 'above', 12, now, plain)).toMatchObject({
      rows: [row],
      levels: { high: 'compact', a, b },
      dropped: [],
    });
  },
);

test('backfill is deterministic across repeated renders and publication arrival order', () => {
  for (const width of [167, 90, 60, 45, 20]) {
    const segments = realisticUsage();
    const result = layout(segments, new Map(), 'below', width, now, plain);
    expect(layout(segments, new Map(), 'below', width, now, plain)).toEqual(result);
    expect(layout(segments.reverse(), new Map(), 'below', width, now, plain)).toEqual(result);
  }
});
