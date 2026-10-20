import { expect, test } from 'bun:test';
import { DETAIL_LEVELS, type Part } from '../src/contract.ts';
import { layout } from '../src/layout.ts';
import type { PartTheme } from '../src/parts.ts';
import { now, segment } from './fixture.ts';

function workload(kind: 'link' | 'value') {
  return Array.from({ length: 16 }, (_, i) =>
    segment(`g${i}.s${i}`, {
      order: i,
      priority: i,
      forms: Object.fromEntries(
        DETAIL_LEVELS.map((level, n) => [
          level,
          Array.from(
            { length: 24 },
            (): Part =>
              kind === 'link'
                ? { kind: 'link', text: 'PR#1234', url: 'https://github.com/o/r/pull/1234' }
                : { kind: 'value', text: 'x'.repeat((4 - n) * 4), status: 'critical' },
          ),
        ]),
      ) as ReturnType<typeof segment>['forms'],
    }),
  );
}

const ansi: PartTheme = {
  fg: (_color, text) => `\x1b[32m${text}\x1b[0m`,
  underline: (text) => `\x1b[4m${text}\x1b[24m`,
};

test.each(['link', 'value'] as const)(
  'packing renders each %s form at most once per call',
  (kind) => {
    let renders = 0;
    const theme: PartTheme = {
      ...ansi,
      fg: (color, text) => {
        if (text.includes('PR#1234') || text.startsWith('xxxx')) renders++;
        return ansi.fg(color, text);
      },
    };
    const segments = workload(kind);
    for (let call = 0; call < 2; call++) {
      renders = 0;
      layout(segments, new Map(), 'above', 80, now, theme, true);
      expect(renders).toBeLessThanOrEqual(16 * 24 * DETAIL_LEVELS.length);
    }
  },
);

test.each([
  { kind: 'link' as const, ceiling: 5 },
  { kind: 'value' as const, ceiling: 3 },
])('16 groups x 24 $kind parts stay within the CI packing budget', ({ kind, ceiling }) => {
  const segments = workload(kind);
  const config = new Map();
  const run = () => layout(segments, config, 'above', 80, now, ansi, true);
  for (let i = 0; i < 50; i++) run();
  const batches = Array.from({ length: 5 }, () => {
    const start = performance.now();
    for (let i = 0; i < 30; i++) run();
    return (performance.now() - start) / 30;
  }).sort((a, b) => a - b);
  expect(batches[2]).toBeLessThan(ceiling);
});
