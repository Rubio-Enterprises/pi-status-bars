import { expect, test } from 'bun:test';
import { stripTerminalSequences, visibleWidth } from '@earendil-works/pi-tui';
import { parseConfig } from '../src/config.ts';
import { DETAIL_LEVELS, type Part } from '../src/contract.ts';
import { layout } from '../src/layout.ts';
import { now, plain, segment } from './fixture.ts';

test('seeded layout fuzz: never throws, exceeds columns/row cap, mutates inputs or shifts countdown packing', () => {
  let seed = 0x42c0ffee;
  const random = (limit: number) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % limit;
  };
  const words = ['ASCII', '中文', '👨‍👩‍👧‍👦', 'é', '', '●', 'long title '.repeat(15)];
  for (let trial = 0; trial < 1200; trial++) {
    const cap = 1 + random(4);
    const width =
      trial < 8 ? ([0, 1, -1, NaN, Infinity, -Infinity, 1.9, 20][trial] ?? 0) : random(201);
    const columns = Number.isFinite(width) ? Math.max(0, Math.floor(width)) : 0;
    const line = random(2) ? 'above' : 'below';
    const config = parseConfig({ lines: { [line]: { maxRows: cap } } }, () => {});
    const segments = Array.from({ length: random(17) }, (_, i) =>
      segment(`g${random(4)}.s${i}`, {
        line,
        zone: random(2) ? 'left' : 'right',
        order: random(5),
        priority: random(5),
        forms: {
          full: [],
          ...Object.fromEntries(
            DETAIL_LEVELS.map((level) => [
              level,
              Array.from({ length: random(8) }, (): Part => {
                switch (random(7)) {
                  case 0:
                    return { kind: 'countdown', at: now + 138 * 60_000 };
                  case 1:
                    return { kind: 'separator' };
                  case 2:
                    return { kind: 'meter', fraction: random(101) / 100, status: 'warn' };
                  case 3:
                    return { kind: 'diff', additions: random(1000), deletions: random(1000) };
                  case 4:
                    return {
                      kind: 'link',
                      text: words[random(words.length)] ?? '',
                      url: 'https://example.com',
                    };
                  default:
                    return {
                      kind: 'value',
                      text: words[random(words.length)] ?? '',
                      elastic: random(4) === 0,
                    };
                }
              }),
            ]),
          ),
        },
      }),
    );
    const input = JSON.stringify(segments);
    const theme =
      trial % 2
        ? plain
        : {
            ...plain,
            fg: (_role: Parameters<typeof plain.fg>[0], text: string) =>
              `\u001b[32m${text}\u001b[0m`,
          };
    const output = layout(segments, config, line, width, now, theme, trial % 3 === 0);
    expect(
      layout([...segments].reverse(), config, line, width, now, theme, trial % 3 === 0),
    ).toEqual(output);
    expect(output.rows.length).toBeLessThanOrEqual(cap);
    for (const row of output.rows) {
      expect(visibleWidth(row)).toBeLessThanOrEqual(columns);
      expect(stripTerminalSequences(row)).not.toMatch(/[\r\n]/);
    }
    const ticked = layout(segments, config, line, width, now + 79 * 60_000, theme);
    expect(ticked.levels).toEqual(output.levels);
    expect(ticked.dropped).toEqual(output.dropped);
    expect(ticked.rows.length).toBe(output.rows.length);
    expect(JSON.stringify(segments)).toBe(input);
  }
});
