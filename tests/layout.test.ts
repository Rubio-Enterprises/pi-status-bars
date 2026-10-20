import { expect, test } from 'bun:test';
import { stripTerminalSequences, visibleWidth } from '@earendil-works/pi-tui';
import { parseConfig } from '../src/config.ts';
import type { Part, Segment } from '../src/contract.ts';
import { layout } from '../src/layout.ts';
import { now, plain, prs, segment, text, usage } from './fixture.ts';

for (const width of [200, 160, 130, 110, 90, 80, 60, 45, 20]) {
  for (const line of ['above', 'below'] as const) {
    test(`golden ${line} width ${width}`, () => {
      const output = layout(line === 'above' ? prs() : usage(), new Map(), line, width, now, plain);
      expect({ ...output, rows: output.rows.map(stripTerminalSequences) }).toMatchSnapshot();
      expect(output.rows.length).toBeLessThanOrEqual(line === 'below' ? 2 : 1);
      expect(visibleWidth(output.rows[0] ?? '')).toBeLessThanOrEqual(width);
    });
  }
}
for (const width of [200, 160, 130, 110, 90, 80, 60, 45, 20]) {
  test(`golden overflow statuses width ${width}`, () => {
    const segments = prs().concat(
      Array.from({ length: 11 }, (_, i) =>
        segment(`pr.hidden-${i}`, {
          order: 100 + i,
          priority: 0,
          forms: {
            full: [
              text(`#${200 + i}`),
              { kind: 'value', text: '●', status: i % 2 ? 'warn' : 'critical' },
            ],
            minimal: [text(`#${200 + i}`)],
          },
        }),
      ),
    );
    const output = layout(segments, new Map(), 'above', width, now, plain);
    expect({ ...output, rows: output.rows.map(stripTerminalSequences) }).toMatchSnapshot();
    expect(output.rows.length).toBeLessThanOrEqual(1);
    expect(visibleWidth(output.rows[0] ?? '')).toBeLessThanOrEqual(width);
  });
}

test.each<{ name: string; parts: Part[]; suffix: string }>([
  {
    name: 'critical value',
    parts: [{ kind: 'value', text: '●', status: 'critical' }],
    suffix: ' ●1',
  },
  { name: 'warn meter', parts: [{ kind: 'meter', fraction: 0, status: 'warn' }], suffix: ' ●1' },
  {
    name: 'critical overrides warn and repeated critical parts count once',
    parts: [
      { kind: 'value', text: '●', status: 'warn' },
      { kind: 'meter', fraction: 1, status: 'critical' },
      { kind: 'value', text: '●', status: 'critical' },
    ],
    suffix: ' ●1',
  },
  {
    name: 'critical before warn',
    parts: [
      { kind: 'value', text: '●', status: 'critical' },
      { kind: 'meter', fraction: 1, status: 'warn' },
    ],
    suffix: ' ●1',
  },
  {
    name: 'warn overrides ok and muted',
    parts: [
      { kind: 'value', text: '●', status: 'ok' },
      { kind: 'value', text: '●', status: 'warn' },
      { kind: 'meter', fraction: 1, status: 'muted' },
    ],
    suffix: ' ●1',
  },
  { name: 'ok', parts: [{ kind: 'value', text: '●', status: 'ok' }], suffix: '' },
  { name: 'muted', parts: [{ kind: 'meter', fraction: 1, status: 'muted' }], suffix: '' },
  { name: 'status-less', parts: [text('plain')], suffix: '' },
])('overflow aggregates full-form status: $name', ({ parts, suffix }) => {
  const output = layout(
    [
      segment('fake.keep', { priority: 100, forms: { full: [text('keep')] } }),
      segment('fake.drop', {
        forms: { full: [text('x'.repeat(100)), ...parts], minimal: [text('x'.repeat(40))] },
      }),
    ],
    new Map(),
    'above',
    20,
    now,
    plain,
  );
  expect(output).toMatchObject({
    levels: { fake: 'minimal' },
    dropped: ['fake.drop'],
    rows: [`keep │ +1${suffix}`],
  });
});

test('overflow counts segments once at their highest severity, critical before warn', () => {
  const statuses = [
    ['warn', 'critical', 'critical'],
    ['critical', 'warn'],
    ['warn', 'warn', 'ok'],
    ['ok', 'muted'],
  ] as const;
  const segments = [
    segment('fake.keep', { priority: 100, forms: { full: [text('K')] } }),
    ...statuses.map((parts, i) =>
      segment(`fake.drop-${i}`, {
        forms: {
          full: [
            text('x'.repeat(100)),
            ...parts.map((status): Part => ({ kind: 'value', text: '●', status })),
          ],
          minimal: [text('x'.repeat(40))],
        },
      }),
    ),
  ];
  expect(layout(segments, new Map(), 'above', 20, now, plain).rows).toEqual(['K │ +4 ●2 ●1']);
});

function overflowSegments(): Segment[] {
  return [
    segment('fake.keep', { priority: 100, forms: { full: [text('K')] } }),
    ...(['critical', 'warn'] as const).map((status, i) =>
      segment(`fake.${status}`, {
        priority: i,
        forms: {
          full: [text('x'.repeat(100)), { kind: 'value', text: '●', status }],
          minimal: [text('x'.repeat(40))],
        },
      }),
    ),
  ];
}

test.each([
  [12, 'K │ +2 ●1 ●1'],
  [11, 'K │ +2 ●1'],
  [9, 'K │ +2 ●1'],
  [8, 'K │ +2'],
  [6, 'K │ +2'],
  [5, 'K │ …'],
] as const)('overflow shrink order at width %s', (width, row) => {
  const output = layout(overflowSegments(), new Map(), 'above', width, now, plain);
  expect({ ...output, rows: output.rows.map(stripTerminalSequences) }).toMatchObject({
    levels: { fake: 'minimal' },
    dropped: ['fake.critical', 'fake.warn'],
    rows: [row],
    countdown: false,
  });
});

test('segments drop before overflow status counts shrink', () => {
  const segments = overflowSegments();
  const warn = segments[2];
  if (!warn) throw new Error('Missing warn segment');
  warn.forms.minimal = [text('W')];
  expect(layout(segments, new Map(), 'above', 9, now, plain)).toMatchObject({
    dropped: ['fake.critical', 'fake.warn'],
    rows: ['K │ +2 ●1'],
  });
});

test('overflow uses full status, zone overrides and existing theme roles; hidden/other-line/surviving segments never count', () => {
  const segments = overflowSegments();
  const keep = segments[0];
  if (!keep) throw new Error('Missing surviving segment');
  keep.forms.full = [{ kind: 'value', text: 'K', status: 'critical' }];
  segments.push(
    segment('fake.hidden', { forms: { full: [{ kind: 'value', text: '●', status: 'critical' }] } }),
    segment('fake.below', {
      line: 'below',
      forms: { full: [{ kind: 'value', text: '●', status: 'warn' }] },
    }),
    segment('fake.plain', {
      priority: -1,
      forms: {
        full: [text('x'.repeat(100))],
        minimal: [{ kind: 'value', text: 'x'.repeat(40), status: 'critical' }],
      },
    }),
  );
  const config = parseConfig(
    { segments: { 'fake.hidden': { hidden: true }, 'fake.warn': { zone: 'right' } } },
    () => {},
  );
  const roles: Array<[string, string]> = [];
  const theme = {
    ...plain,
    fg: (color: Parameters<typeof plain.fg>[0], value: string) => {
      roles.push([color, value]);
      return `\u001b[31m${value}\u001b[0m`;
    },
  };
  const output = layout(segments, config, 'above', 19, now, theme);
  expect(output.dropped).toEqual(['fake.plain', 'fake.critical', 'fake.warn']);
  expect(output.rows.map(stripTerminalSequences)).toEqual(['K │ +2 ●1     +1 ●1']);
  expect(roles).toContainEqual(['dim', '+2']);
  expect(roles).toContainEqual(['dim', '+1']);
  expect(roles).toContainEqual(['error', '●1']);
  expect(roles).toContainEqual(['warning', '●1']);
  for (let width = 0; width <= 100; width++) {
    const result = layout(segments, config, 'above', width, now, theme);
    expect(result.rows.length).toBeLessThanOrEqual(1);
    expect(visibleWidth(result.rows[0] ?? '')).toBeLessThanOrEqual(width);
  }
});

test('group detail level lowers in lockstep and form fallback is per segment', () => {
  const segments = [
    segment('fake.a', {
      forms: { full: [text('a full')], compact: [text('a')], terse: [text('A')] },
    }),
    segment('fake.b', {
      forms: { full: [text('b full')], compact: [text('b')], terse: [text('B')] },
    }),
  ];
  expect(layout(segments, new Map(), 'above', 5, now, plain)).toMatchObject({
    levels: { fake: 'compact' },
    rows: ['a │ b'],
  });
});
test('elastic receives leftover width; below eight columns it vanishes', () => {
  const s = segment('fake.one', {
    forms: {
      full: [
        text('ID'),
        { kind: 'value', text: 'a long elastic title', elastic: true },
        text('tail'),
      ],
    },
  });
  expect(layout([s], new Map(), 'above', 20, now, plain).rows.map(stripTerminalSequences)).toEqual([
    'ID a long elas… tail',
  ]);
  expect(layout([s], new Map(), 'above', 14, now, plain).rows).toEqual(['ID tail']);
  expect(layout([s], new Map(), 'above', 16, now, plain).rows.map(stripTerminalSequences)).toEqual([
    'ID a long … tail',
  ]);
});
test('only the first elastic part in zone and order sequence gets room', () => {
  const segments = [
    segment('fake.a', { forms: { full: [{ kind: 'value', text: 'first', elastic: true }] } }),
    segment('fake.b', { forms: { full: [{ kind: 'value', text: 'second', elastic: true }] } }),
  ];
  expect(layout(segments, new Map(), 'above', 40, now, plain).rows).toEqual(['first']);
});
test('zone gap is at least three columns; right-only segments align right', () => {
  const segments = [
    segment('fake.a', { forms: { full: [text('L')] } }),
    segment('fake.b', { zone: 'right', forms: { full: [text('R')] } }),
  ];
  expect(layout(segments, new Map(), 'above', 10, now, plain).rows).toEqual(['L        R']);
  expect(layout(segments.slice(1), new Map(), 'above', 10, now, plain).rows).toEqual([
    '         R',
  ]);
  expect(layout(segments, new Map(), 'above', 5, now, plain).rows).toEqual(['L   R']);
});
test('backfill restores exposure without reversing usage drop priorities; markers stay in original zone', () => {
  const output = layout(
    usage(),
    parseConfig({ lines: { below: { maxRows: 1 } } }, () => {}),
    'below',
    45,
    now,
    plain,
  );
  expect(output.dropped).toEqual(['usage.gemini', 'usage.chatgpt']);
  expect(output.rows.join('')).toContain('+2');
});
test('drop ties: later order, then lexically later ID; sorting uses order then ID', () => {
  const segments = ['fake.c', 'fake.a', 'fake.b'].map((id) =>
    segment(id, { forms: { full: [text(id)] } }),
  );
  const output = layout(segments, new Map(), 'above', 13, now, plain);
  expect(output.dropped).toEqual(['fake.c', 'fake.b']);
  expect(output.rows[0]).toBe('fake.a │ +2');
  const later = segment('fake.z', { order: 20, forms: { full: [text('later')] } });
  expect(layout([...segments, later], new Map(), 'above', 13, now, plain).dropped[0]).toBe(
    'fake.z',
  );
});
test('all placement fields affect layout; hidden segments never drop or count down', () => {
  const segments = [
    segment('fake.a', { forms: { full: [text('A')] } }),
    segment('fake.b', { forms: { full: [text('B')] } }),
  ];
  const config = parseConfig(
    {
      segments: {
        'fake.a': { line: 'below', zone: 'right', order: 99, priority: 1 },
        'fake.b': { hidden: true },
      },
    },
    () => {},
  );
  expect(layout(segments, config, 'above', 20, now, plain).rows).toEqual([]);
  expect(layout(segments, config, 'below', 5, now, plain).rows).toEqual(['    A']);
});
test('single too-wide segment truncates; ANSI, CJK, emoji, combining and zero widths fit', () => {
  const theme = {
    ...plain,
    fg: (_color: Parameters<typeof plain.fg>[0], value: string) => `\u001b[32m${value}\u001b[0m`,
  };
  for (const width of [0, 1, 2, 3, 4, 7, 20]) {
    const output = layout(
      [
        segment('fake.wide', {
          forms: { full: [{ kind: 'label', text: '中文 é 👨‍👩‍👧‍👦 '.repeat(10) }] },
        }),
      ],
      new Map(),
      'above',
      width,
      now,
      theme,
    );
    expect(output.rows.length).toBeLessThanOrEqual(1);
    expect(visibleWidth(output.rows[0] ?? '')).toBeLessThanOrEqual(width);
  }
});
test('countdown flag reflects surviving form, drop and config visibility', () => {
  const timed = segment('fake.timed', {
    priority: 1,
    forms: { full: [{ kind: 'countdown', at: now + 1 }] },
  });
  expect(layout([timed], new Map(), 'above', 80, now, plain).countdown).toBe(true);
  expect(layout([timed], new Map(), 'above', 1, now, plain).countdown).toBe(false);
  expect(layout([timed], new Map(), 'above', 0, now, plain).countdown).toBe(false);
});
