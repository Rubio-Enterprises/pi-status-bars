import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigStore, parseConfig, placement } from '../src/config.ts';
import { segment } from './fixture.ts';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'status-config-'));
  roots.push(root);
  const path = join(root, 'status-bars.json');
  const warnings: string[] = [];
  return { path, warnings, store: new ConfigStore(path, (message) => warnings.push(message)) };
}
test.each([
  ['line', 'below'],
  ['zone', 'right'],
  ['order', 0],
  ['priority', 0],
  ['hidden', true],
] as const)('placement override %s', (field, value) => {
  const config = parseConfig({ segments: { 'fake.one': { [field]: value } } }, () => {});
  expect(placement(segment(), config)[field]).toBe(value);
});
test('default placement and exact ID only; unknown keys ignored', () => {
  const warnings: string[] = [];
  const config = parseConfig(
    {
      extra: 1,
      segments: {
        'fake.one': { line: 'below', extra: 1 },
        'fake.*': { hidden: true },
        'fake.bad': { order: 'x' },
        'fake.nil': null,
        'fake.array': [],
        'fake.good': { priority: 3 },
      },
    },
    (m) => warnings.push(m),
  );
  expect(config.size).toBe(2);
  expect(config.get('fake.one')).toEqual({ line: 'below' });
  expect(placement(segment('fake.two'), config)).toEqual({
    line: 'above',
    zone: 'left',
    order: 10,
    priority: 10,
    hidden: false,
  });
  expect(warnings).toHaveLength(4);
});
test.each([null, [], 1, { segments: [] }, { segments: null }].map((input) => ({ input })))(
  'invalid config root %#',
  ({ input }) => {
    const warnings: string[] = [];
    expect(parseConfig(input, (m) => warnings.push(m)).size).toBe(0);
    expect(warnings).toHaveLength(1);
  },
);
test('missing file, stat cache by mtime and size, re-read and delete without writes', () => {
  const { path, store, warnings } = fixture();
  expect(store.read().size).toBe(0);
  writeFileSync(path, '{"segments":{"fake.one":{"priority":5}}}');
  const first = store.read();
  expect(store.read()).toBe(first);
  expect(first.get('fake.one')).toEqual({ priority: 5 });
  const body = '{"segments":{"fake.one":{"hidden":true}}}';
  writeFileSync(path, body);
  utimesSync(path, new Date(), new Date(Date.now() + 1000));
  expect(store.read().get('fake.one')).toEqual({ hidden: true });
  expect(readFileSync(path, 'utf8')).toBe(body);
  rmSync(path);
  expect(store.read().size).toBe(0);
  expect(warnings).toEqual([]);
});
test('unparsable config and invalid entries warn once per session and recover', () => {
  const { path, store, warnings } = fixture();
  writeFileSync(path, 'bad json');
  expect(store.read().size).toBe(0);
  store.read();
  writeFileSync(path, 'bad json again');
  store.read();
  expect(warnings).toHaveLength(1);
  writeFileSync(path, '{"segments":{"fake.one":{"order":false}}}');
  store.read();
  store.read();
  expect(warnings).toHaveLength(2);
  store.resetWarnings();
  writeFileSync(path, '{"segments":{"fake.one":{"order":false}},"x":1}');
  store.read();
  expect(warnings).toHaveLength(3);
  writeFileSync(path, '{"segments":{"fake.one":{"line":"below"}}}');
  expect(store.read().get('fake.one')).toEqual({ line: 'below' });
});
