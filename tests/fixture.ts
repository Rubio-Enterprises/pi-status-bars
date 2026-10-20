import type { Part, Publication, Segment } from '../src/contract.ts';
import type { PartTheme } from '../src/parts.ts';

export const plain: PartTheme = { fg: (_color, text) => text, underline: (text) => text };
export const now = 1_700_000_000_000;
export const text = (value: string): Part => ({ kind: 'value', text: value });
export function segment(id = 'fake.one', options: Partial<Segment> = {}): Segment {
  return {
    id,
    line: 'above',
    zone: 'left',
    order: 10,
    priority: 10,
    forms: { full: [text('hello')] },
    ...options,
  };
}
export function publication(segments: Segment[] = [segment()], publisher = 'fake'): Publication {
  return { version: 1, publisher, segments };
}
export function usage(): Segment[] {
  return ['claude', 'chatgpt', 'gemini']
    .map((name, index) => {
      const windows = [index === 2 ? 'day' : '5h', 'week'];
      const parts = (level: 'full' | 'compact' | 'terse' | 'minimal'): Part[] => {
        const output: Part[] = [
          {
            kind: 'label',
            text: level === 'minimal' ? (['cl', 'gpt', 'gem'][index] ?? name) : name,
          },
        ];
        windows.forEach((window, i) => {
          if (i) output.push({ kind: 'separator' });
          output.push({ kind: 'label', text: window });
          if (level === 'full' || level === 'compact')
            output.push({ kind: 'meter', fraction: 0.42, status: 'ok' });
          output.push({ kind: 'value', text: level === 'full' ? '42% used' : '42%', status: 'ok' });
          if (level !== 'minimal')
            output.push({ kind: 'countdown', at: now + (i ? 27 * 3600_000 : 138 * 60_000) });
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
    })
    .concat(
      segment('exposure.summary', {
        line: 'below',
        zone: 'right',
        order: 100,
        priority: 10,
        forms: {
          full: [{ kind: 'note', text: 'exposure 2 tools off · 1 skill hidden' }],
          compact: [{ kind: 'note', text: '⊘ 2 tools · 1 skill' }],
          terse: [{ kind: 'note', text: '⊘ 2t 1s' }],
          minimal: [{ kind: 'note', text: '⊘3' }],
        },
      }),
    );
}
export function prs(): Segment[] {
  const link: Part = { kind: 'link', text: '#123', url: 'https://github.com/o/r/pull/123' };
  const dot: Part = { kind: 'value', text: '●', status: 'ok' };
  const full: Part[] = [
    { kind: 'label', text: '' },
    link,
    { kind: 'value', text: 'Unify semantic status segments across all publishers', elastic: true },
    { kind: 'diff', additions: 42, deletions: 8 },
    dot,
  ];
  return [
    segment('pr.focus', {
      priority: 50,
      forms: {
        full,
        compact: full,
        terse: [link, { kind: 'diff', additions: 42, deletions: 8 }, dot],
        minimal: [link, dot],
      },
    }),
    ...[1, 2, 3, 4].map((n) =>
      segment(`pr.extra-${n}`, {
        order: 10 + n * 10,
        priority: 50 - n * 10,
        forms: {
          full: [{ kind: 'link', text: `#${123 + n}`, url: 'https://example.com' }, dot],
          minimal: [{ kind: 'link', text: `#${123 + n}`, url: 'https://example.com' }],
        },
      }),
    ),
  ];
}
