import { afterEach, expect, spyOn, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fauxProvider, InMemoryCredentialStore } from '@earendil-works/pi-ai';
import {
  createAgentSession,
  DefaultResourceLoader,
  type ExtensionAPI,
  type ExtensionFactory,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import { PUBLISH_CHANNEL, type Publication, REQUEST_CHANNEL } from '../src/contract.ts';
import statusBars from '../src/index.ts';
import { publication, segment, text } from './fixture.ts';
import { uiFixture } from './ui-fixture.ts';

const disposals: Array<() => void> = [];
const previous = process.env.PI_CODING_AGENT_DIR;
afterEach(() => {
  for (const dispose of disposals.splice(0).reverse()) dispose();
  if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previous;
});

async function harness(
  rendererFirst: boolean,
  initial: Publication = publication(),
  rendererFromFile = false,
) {
  const root = mkdtempSync(join(tmpdir(), 'status-sdk-'));
  disposals.push(() => rmSync(root, { recursive: true, force: true }));
  const cwd = join(root, 'workspace'),
    agentDir = join(root, 'agent');
  mkdirSync(cwd, { recursive: true });
  mkdirSync(agentDir, { recursive: true });
  process.env.PI_CODING_AGENT_DIR = agentDir;
  const settings = SettingsManager.inMemory(
    { compaction: { enabled: false }, retry: { enabled: false }, defaultTools: [] },
    { projectTrusted: true },
  );
  const faux = fauxProvider();
  const runtime = await ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsPath: null,
    refreshOnCreate: false,
  });
  runtime.registerNativeProvider(faux.provider);
  let api: ExtensionAPI | undefined;
  let last = initial,
    requests = 0,
    loads = 0;
  const publisher: ExtensionFactory = (pi) => {
    api = pi;
    loads++;
    const stop = pi.events.on(REQUEST_CHANNEL, (payload) => {
      expect(payload).toEqual({ version: 1 });
      requests++;
      pi.events.emit(PUBLISH_CHANNEL, last);
    });
    pi.on('session_start', () => pi.events.emit(PUBLISH_CHANNEL, last));
    pi.on('session_shutdown', () => {
      pi.events.emit(PUBLISH_CHANNEL, publication([]));
      stop();
    });
  };
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager: settings,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    additionalExtensionPaths: rendererFromFile
      ? [fileURLToPath(new URL('../src/index.ts', import.meta.url))]
      : [],
    extensionFactories: rendererFromFile
      ? [publisher]
      : rendererFirst
        ? [statusBars, publisher]
        : [publisher, statusBars],
  });
  await loader.reload();
  expect(loader.getExtensions().errors).toEqual([]);
  const { session } = await createAgentSession({
    cwd,
    agentDir,
    modelRuntime: runtime,
    model: faux.getModel(),
    resourceLoader: loader,
    settingsManager: settings,
    sessionManager: SessionManager.inMemory(cwd),
    thinkingLevel: 'off',
    noTools: 'all',
  });
  disposals.push(() => session.dispose());
  const h = uiFixture(),
    errors: string[] = [];
  await session.bindExtensions({
    uiContext: h.ui,
    mode: 'tui',
    onError: (error) => errors.push(error.error),
    commandContextActions: {
      waitForIdle: () => session.waitForIdle(),
      newSession: async () => ({ cancelled: true }),
      fork: async () => ({ cancelled: true }),
      navigateTree: async () => ({ cancelled: true }),
      switchSession: async () => ({ cancelled: true }),
      reload: async () => {},
    },
  });
  expect(errors).toEqual([]);
  return {
    ...h,
    session,
    errors,
    get requests() {
      return requests;
    },
    get loads() {
      return loads;
    },
    publish(value: Publication) {
      last = value;
      api?.events.emit(PUBLISH_CHANNEL, last);
    },
    invalid(value: unknown) {
      api?.events.emit(PUBLISH_CHANNEL, value);
    },
    async shutdown() {
      await session.extensionRunner.emit({ type: 'session_shutdown', reason: 'quit' });
    },
    async toggle() {
      const shortcut = session.extensionRunner.getShortcuts({}).get('alt+u');
      if (!shortcut) throw new Error('Missing shortcut');
      await shortcut.handler(session.extensionRunner.createContext());
    },
  };
}
for (const rendererFirst of [true, false]) {
  test(`SDK handshake in ${rendererFirst ? 'renderer-first' : 'publisher-first'} load order`, async () => {
    const h = await harness(rendererFirst);
    expect(h.requests).toBe(1);
    expect(h.render()).toEqual([{ key: 'status-bars.above', row: 'hello' }]);
    expect(h.errors).toEqual([]);
    await h.shutdown();
  });
  test(`SDK replace, clear and independent publishers (${rendererFirst})`, async () => {
    const h = await harness(rendererFirst);
    h.publish(
      publication([
        segment('fake.second', { line: 'below', forms: { full: [text('replacement')] } }),
      ]),
    );
    expect(h.components.has('status-bars.above')).toBe(false);
    expect(h.render()).toEqual([{ key: 'status-bars.below', row: 'replacement' }]);
    h.publish(
      publication([segment('other.one', { forms: { full: [text('independent')] } })], 'other'),
    );
    expect(h.render().map((x) => x.row)).toEqual(['replacement', 'independent']);
    h.publish(publication([]));
    expect(h.render()).toEqual([{ key: 'status-bars.above', row: 'independent' }]);
    h.publish(publication([], 'other'));
    expect(h.components.size).toBe(0);
    await h.shutdown();
  });
  test(`SDK reload recreates handshake without stale lines or subscriptions (${rendererFirst})`, async () => {
    const h = await harness(rendererFirst);
    const old = [...h.components.values()];
    h.publish(
      publication([segment('fake.new', { line: 'below', forms: { full: [text('latest')] } })]),
    );
    await h.session.reload();
    expect(h.loads).toBe(2);
    expect(h.requests).toBe(2);
    expect(old.flatMap((component) => component.render(80))).toEqual([]);
    expect(h.render()).toEqual([{ key: 'status-bars.below', row: 'latest' }]);
    h.invalid({ publisher: 'fake', version: 2 });
    h.invalid({ publisher: 'fake', version: 2 });
    expect(h.warnings).toHaveLength(1);
    await h.session.reload();
    expect(h.requests).toBe(3);
    h.invalid({ publisher: 'fake', version: 2 });
    expect(h.warnings).toHaveLength(2);
    expect(h.errors).toEqual([]);
    await h.shutdown();
  });
}
test('SDK shutdown clears both lines, clock and subscriptions; later events cannot resurrect them', async () => {
  const intervals = spyOn(globalThis, 'setInterval'),
    clears = spyOn(globalThis, 'clearInterval');
  disposals.push(() => {
    intervals.mockRestore();
    clears.mockRestore();
  });
  const h = await harness(
    true,
    publication([
      segment(),
      segment('fake.clock', {
        line: 'below',
        forms: { full: [{ kind: 'countdown', at: Date.now() + 600_000 }] },
      }),
    ]),
  );
  h.render();
  const clock = intervals.mock.results
    .map((result) => result.value)
    .find((value) => value && !(value as ReturnType<typeof setInterval>).hasRef());
  expect(clock).toBeDefined();
  const old = [...h.components.values()];
  await h.shutdown();
  expect(h.components.size).toBe(0);
  expect(clears.mock.calls.some((args) => args[0] === clock)).toBe(true);
  h.publish(publication());
  h.invalid({ publisher: 'fake', version: 2 });
  expect(h.components.size).toBe(0);
  expect(h.warnings).toEqual([]);
  expect(old.flatMap((component) => component.render(80))).toEqual([]);
  expect(h.errors).toEqual([]);
});
test.each([false, true])(
  'SDK shortcut stays hidden through reload and restores latest publication (file renderer: %s)',
  async (rendererFromFile) => {
    const h = await harness(false, publication(), rendererFromFile);
    expect(h.render()).toEqual([{ key: 'status-bars.above', row: 'hello' }]);
    await h.toggle();
    try {
      expect(h.components.size).toBe(0);
      h.publish(publication([segment('fake.latest', { forms: { full: [text('latest')] } })]));
      await h.session.reload();
      expect(h.loads).toBe(2);
      expect(h.requests).toBe(2);
      expect(h.components.size).toBe(0);
      expect(h.render()).toEqual([]);
    } finally {
      await h.toggle();
    }
    expect(h.render()).toEqual([{ key: 'status-bars.above', row: 'latest' }]);
    expect(h.errors).toEqual([]);
    await h.shutdown();
  },
);
