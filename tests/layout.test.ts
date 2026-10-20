import { expect, test } from 'bun:test';
import { stripTerminalSequences, visibleWidth } from '@earendil-works/pi-tui';
import { parseConfig } from '../src/config.ts';
import { layout } from '../src/layout.ts';
import { now, plain, prs, segment, text, usage } from './fixture.ts';

for (const width of [200, 160, 130, 110, 90, 80, 60, 45, 20]) {
  for (const line of ['above', 'below'] as const) {
    test(`golden ${line} width ${width}`, () => {
      const output = layout(line === 'above' ? prs() : usage(), new Map(), line, width, now, plain);
      expect({ ...output, rows: output.rows.map(stripTerminalSequences) }).toMatchSnapshot();
      expect(output.rows.length).toBeLessThanOrEqual(1);
      expect(visibleWidth(output.rows[0] ?? '')).toBeLessThanOrEqual(width);
    });
  }
}
test('shared detail level lowers in lockstep and form fallback is per segment', () => {
  const segments = [
    segment('fake.a', {
      forms: { full: [text('a full')], compact: [text('a')], terse: [text('A')] },
    }),
    segment('fake.b', {
      forms: { full: [text('b full')], compact: [text('b')], terse: [text('B')] },
    }),
  ];
  expect(layout(segments, new Map(), 'above', 5, now, plain)).toMatchObject({
    level: 'compact',
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
test('drop priorities match exposure, gemini, chatgpt, claude; markers stay in original zone', () => {
  const output = layout(usage(), new Map(), 'below', 45, now, plain);
  expect(output.dropped).toEqual(['exposure.summary', 'usage.gemini', 'usage.chatgpt']);
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
