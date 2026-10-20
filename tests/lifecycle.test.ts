import { afterEach, expect, spyOn, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { type Part, PUBLISH_CHANNEL, REQUEST_CHANNEL } from '../src/contract.ts';
import statusBars from '../src/index.ts';
import { now, publication, segment, text } from './fixture.ts';
import { uiFixture } from './ui-fixture.ts';

const disposals: Array<() => void> = [];
const previous = process.env.PI_CODING_AGENT_DIR;
afterEach(() => {
  for (const dispose of disposals.splice(0).reverse()) dispose();
  if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previous;
});
function harness(mode = 'tui') {
  const root = mkdtempSync(join(tmpdir(), 'status-lifecycle-'));
  process.env.PI_CODING_AGENT_DIR = root;
  disposals.push(() => rmSync(root, { recursive: true, force: true }));
  const h = uiFixture();
  const ctx = { ui: h.ui, mode } as ExtensionContext;
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const handlers = new Map<string, (event: unknown, ctx: ExtensionContext) => void>();
  let toggle: () => Promise<void> = async () => {};
  const events = {
    on(channel: string, handler: (payload: unknown) => void) {
      let group = listeners.get(channel);
      if (!group) {
        group = new Set();
        listeners.set(channel, group);
      }
      group.add(handler);
      return () => group.delete(handler);
    },
    emit(channel: string, payload: unknown) {
      for (const handler of listeners.get(channel) ?? []) handler(payload);
    },
  };
  const api = {
    events,
    on(event: string, handler: (event: unknown, ctx: ExtensionContext) => void) {
      handlers.set(event, handler);
    },
    registerShortcut(key: string, options: { handler: () => Promise<void> }) {
      expect(key).toBe('alt+u');
      toggle = options.handler;
    },
  } as unknown as ExtensionAPI;
  statusBars(api);
  const start = () => handlers.get('session_start')?.({}, ctx);
  const stop = () => handlers.get('session_shutdown')?.({}, ctx);
  disposals.push(stop);
  return {
    ...h,
    get renders() {
      return h.renders;
    },
    root,
    ctx,
    events,
    listeners,
    start,
    stop,
    toggle: () => toggle(),
    publish: (payload: unknown) => events.emit(PUBLISH_CHANNEL, payload),
  };
}
test('factory subscribes before start, start clears stale store and requests version 1', () => {
  const h = harness();
  h.publish(publication());
  let request: unknown;
  h.events.on(REQUEST_CHANNEL, (payload) => {
    request = payload;
    h.publish(publication([segment('fake.new')]));
  });
  h.start();
  expect(request).toEqual({ version: 1 });
  expect(h.render()).toEqual([{ key: 'status-bars.above', row: 'hello' }]);
  expect(h.placements.get('status-bars.above')).toBe('aboveEditor');
  expect(h.listeners.get(PUBLISH_CHANNEL)?.size).toBe(1);
});
test('invalid publications warn once per publisher per session and preserve valid state', () => {
  const h = harness();
  h.start();
  h.publish(publication());
  for (let i = 0; i < 5; i++) h.publish({ publisher: 'fake', version: 2 });
  h.publish({ publisher: 'other', version: 2 });
  expect(h.warnings).toHaveLength(2);
  expect(h.render()[0]?.row).toBe('hello');
  h.start();
  h.publish({ publisher: 'fake', version: 2 });
  expect(h.warnings).toHaveLength(3);
});
test('one unref clock only while a countdown is actually visible; toggle keeps publications', async () => {
  const intervals = spyOn(globalThis, 'setInterval');
  const clears = spyOn(globalThis, 'clearInterval');
  disposals.push(() => {
    intervals.mockRestore();
    clears.mockRestore();
  });
  const h = harness();
  h.start();
  h.publish(
    publication([
      segment('fake.timed', { forms: { full: [{ kind: 'countdown', at: now + 1000 }] } }),
    ]),
  );
  expect(intervals).not.toHaveBeenCalled();
  h.render();
  expect(intervals).toHaveBeenCalledTimes(1);
  expect(intervals.mock.calls[0]?.[1]).toBeLessThanOrEqual(60_000);
  const interval = intervals.mock.results[0]?.value as ReturnType<typeof setInterval> | undefined;
  expect(interval?.hasRef()).toBe(false);
  h.render();
  h.render();
  expect(intervals).toHaveBeenCalledTimes(1);
  const tick = intervals.mock.calls[0]?.[0];
  expect(typeof tick).toBe('function');
  if (typeof tick === 'function') tick();
  await h.toggle();
  expect(h.components.size).toBe(0);
  expect(clears).toHaveBeenCalledTimes(1);
  h.publish(publication([segment('fake.timed', { forms: { full: [text('updated')] } })]));
  expect(h.components.size).toBe(0);
  await h.toggle();
  expect(h.render()[0]?.row).toBe('updated');
  expect(intervals).toHaveBeenCalledTimes(1);
});
test('minimal countdown omission, dropped segment, hidden config and clear stop clocks', async () => {
  const intervals = spyOn(globalThis, 'setInterval');
  const clears = spyOn(globalThis, 'clearInterval');
  disposals.push(() => {
    intervals.mockRestore();
    clears.mockRestore();
  });
  const h = harness();
  h.start();
  const timed = segment('fake.timed', { forms: { full: [{ kind: 'countdown', at: now + 1000 }] } });
  h.publish(publication([timed]));
  h.render(1);
  expect(intervals).not.toHaveBeenCalled();
  h.render(80);
  expect(intervals).toHaveBeenCalledTimes(1);
  writeFileSync(join(h.root, 'status-bars.json'), '{"segments":{"fake.timed":{"hidden":true}}}');
  h.render();
  await Promise.resolve();
  expect(h.components.size).toBe(0);
  expect(clears).toHaveBeenCalledTimes(1);
  h.publish(publication([]));
  expect(h.components.size).toBe(0);
});
test.each([
  { name: 'detail-level omission', width: 1, full: [{ kind: 'countdown', at: now }] },
  { name: 'elastic omission', width: 7, full: [{ kind: 'value', text: 'title', elastic: true }] },
] satisfies Array<{ name: string; width: number; full: Part[] }>)(
  'removes a line with no rendered content after $name',
  async ({ width, full }) => {
    const h = harness();
    h.start();
    const p = publication([segment('fake.omitted', { forms: { full } })]);
    h.publish(p);
    expect(h.render(width)).toEqual([]);
    await Promise.resolve();
    expect(h.components.has('status-bars.above')).toBe(false);
    const renders = h.renders;
    await Promise.resolve();
    expect(h.renders).toBe(renders);
    h.publish(p);
    expect(h.components.has('status-bars.above')).toBe(false);
    h.resize(80);
    expect(h.components.has('status-bars.above')).toBe(true);
    expect(h.render()).toHaveLength(1);
    h.resize(width);
    expect(h.components.has('status-bars.above')).toBe(false);
  },
);
test('render checks config and moves lines; unchanged reads do not schedule render loops', async () => {
  const h = harness();
  h.start();
  h.publish(publication());
  h.render();
  await Promise.resolve();
  const absentRenders = h.renders;
  h.render();
  await Promise.resolve();
  expect(h.renders).toBe(absentRenders);
  writeFileSync(
    join(h.root, 'status-bars.json'),
    '{"segments":{"fake.one":{"line":"below","zone":"right"}}}',
  );
  h.render();
  await Promise.resolve();
  expect(h.components.has('status-bars.above')).toBe(false);
  expect(h.placements.get('status-bars.below')).toBe('belowEditor');
  expect(h.render(10)).toEqual([{ key: 'status-bars.below', row: '     hello' }]);
  await Promise.resolve();
  const before = h.renders;
  h.render();
  await Promise.resolve();
  expect(h.renders).toBe(before);
});
test('shutdown clears both lines, unsubscribes and stops clock idempotently', () => {
  const resizeListeners = process.stdout.listenerCount('resize');
  const clears = spyOn(globalThis, 'clearInterval');
  disposals.push(() => clears.mockRestore());
  const h = harness();
  h.start();
  h.publish(
    publication([
      segment(),
      segment('fake.two', { line: 'below', forms: { full: [{ kind: 'countdown', at: now }] } }),
    ]),
  );
  h.render();
  const old = [...h.components.values()];
  h.stop();
  h.stop();
  expect(process.stdout.listenerCount('resize')).toBe(resizeListeners);
  h.resize(200);
  expect(h.components.size).toBe(0);
  expect(h.listeners.get(PUBLISH_CHANNEL)?.size).toBe(0);
  expect(clears).toHaveBeenCalledTimes(1);
  h.publish(publication());
  expect(h.components.size).toBe(0);
  expect(old.flatMap((component) => component.render(80))).toEqual([]);
});
test('headless sessions store and validate without mounting lines or timers', () => {
  const intervals = spyOn(globalThis, 'setInterval');
  disposals.push(() => intervals.mockRestore());
  const h = harness('print');
  h.start();
  h.publish(publication());
  expect(h.components.size).toBe(0);
  expect(intervals).not.toHaveBeenCalled();
});
