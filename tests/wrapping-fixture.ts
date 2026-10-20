import type { Part, Segment } from '../src/contract.ts';
import { now, segment, usage } from './fixture.ts';

export function realisticUsage(): Segment[] {
  const providers = [
    {
      name: 'claude',
      short: 'cl',
      windows: [
        ['5h', 24, 138],
        ['wk', 25, 6120],
      ],
    },
    { name: 'chatgpt', short: 'gpt', windows: [['wk', 5, 9480]] },
    {
      name: 'gemini',
      short: 'gem',
      windows: [
        ['5h', 0, 297],
        ['wk', 0, 10020],
      ],
    },
  ] as const;
  const segments = providers.map(({ name, short, windows }, index) => {
    const parts = (level: 'full' | 'compact' | 'terse' | 'minimal'): Part[] => {
      const output: Part[] = [{ kind: 'label', text: level === 'minimal' ? short : name }];
      windows.forEach(([label, percent, minutes], i) => {
        if (i) output.push({ kind: 'separator' });
        output.push({ kind: 'label', text: label });
        if (level === 'full' || level === 'compact')
          output.push({ kind: 'meter', fraction: percent / 100, status: 'ok' });
        output.push({
          kind: 'value',
          text: `${percent}%${level === 'full' ? ' used' : ''}`,
          status: 'ok',
        });
        if (level === 'full' || level === 'compact')
          output.push({ kind: 'countdown', at: now + minutes * 60_000 });
      });
      return output;
    };
    return segment(`usage.${name}`, {
      line: 'below',
      order: 10 + index * 10,
      priority: 40 - index * 10,
      forms: {
        full: parts('full'),
        compact: parts('compact'),
        terse: parts('terse'),
        minimal: parts('minimal'),
      },
    });
  });
  return segments.concat(usage().filter((s) => s.id === 'exposure.summary'));
}

export const fullUsage =
  'claude 5h ╺────╴ 24% used ↻ 2h18m | wk ╺━───╴ 25% used ↻ 4d6h │ chatgpt wk ╶────╴ 5% used ↻ 6d14h │ gemini 5h ╶────╴ 0% used ↻ 4h57m | wk ╶────╴ 0% used ↻ 6d23h';
