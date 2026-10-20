import { expect, test } from 'bun:test';
import { form } from '../src/layout.ts';
import { countdown, joinParts, meter, renderPart } from '../src/parts.ts';
import { now, plain, segment, text } from './fixture.ts';

test.each([
  [0, 'now'],
  [1, '1m'],
  [59, '59m'],
  [60, '1h'],
  [138, '2h18m'],
  [1440, '1d'],
  [1620, '1d3h'],
])('countdown %s minutes', (minutes, expected) => {
  expect(countdown(now + Number(minutes) * 60_000, now)).toBe(String(expected));
});
test('countdowns round up, clamp expired and format each detail level', () => {
  expect(countdown(now + 1, now)).toBe('1m');
  expect(countdown(now - 1, now)).toBe('now');
  const part = { kind: 'countdown', at: now + 138 * 60_000 } as const;
  expect(
    ['full', 'compact', 'terse', 'minimal'].map((level) =>
      renderPart(part, level as 'full', now, plain, false),
    ),
  ).toEqual(['↻ 2h18m', '↻2h18m', '↻2h', '']);
});
test('forms reuse the next more detailed form', () => {
  const s = segment('fake.one', { forms: { full: [text('full')], terse: [text('terse')] } });
  expect(form(s, 'compact')).toEqual([text('full')]);
  expect(form(s, 'minimal')).toEqual([text('terse')]);
});
test('meter uses six cells and vanishes below compact', () => {
  expect(meter(0, 'ok', plain)).toBe('╶────╴');
  expect(meter(0.5, 'warn', plain)).toBe('╺━━──╴');
  expect(meter(1, 'critical', plain)).toBe('╺━━━━╸');
  expect(
    renderPart({ kind: 'meter', fraction: 0.5, status: 'ok' }, 'terse', now, plain, false),
  ).toBe('');
});
test('semantic theme roles, plain value, diff and separator spacing', () => {
  const roles: string[] = [];
  const theme = {
    ...plain,
    fg: (color: Parameters<typeof plain.fg>[0], value: string) => {
      roles.push(color);
      return value;
    },
  };
  for (const status of ['ok', 'warn', 'critical', 'muted'] as const)
    renderPart({ kind: 'value', text: 'v', status }, 'full', now, theme, false);
  renderPart({ kind: 'label', text: 'l' }, 'full', now, theme, false);
  renderPart({ kind: 'note', text: 'n' }, 'full', now, theme, false);
  expect(roles).toEqual(['success', 'warning', 'error', 'muted', 'muted', 'dim']);
  expect(renderPart(text('plain'), 'full', now, theme, false)).toBe('plain');
  expect(renderPart({ kind: 'diff', additions: 0, deletions: 0 }, 'full', now, theme, false)).toBe(
    '',
  );
  expect(renderPart({ kind: 'diff', additions: 2, deletions: 3 }, 'full', now, theme, false)).toBe(
    '+2-3',
  );
  const parts = [text('a'), { kind: 'separator' } as const, text('b')];
  expect(
    joinParts(parts.map((part) => ({ part, text: renderPart(part, 'full', now, plain, false) }))),
  ).toBe('a | b');
});
test('links use OSC 8 only with safe HTTP(S) URLs and capability support', () => {
  const link = { kind: 'link', text: 'site', url: 'https://example.com' } as const;
  expect(renderPart(link, 'full', now, plain, false)).toBe('site');
  expect(renderPart(link, 'full', now, plain, true)).toContain('\u001b]8;');
  for (const url of [
    'javascript:alert(1)',
    'file:///etc/passwd',
    'bad',
    'https://example.com\u001b',
  ]) {
    expect(renderPart({ ...link, url }, 'full', now, plain, true)).toBe('site');
  }
});
