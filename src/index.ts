import { join } from 'node:path';
import {
  type ExtensionAPI,
  type ExtensionContext,
  getAgentDir,
} from '@earendil-works/pi-coding-agent';
import { getCapabilities, type TUI } from '@earendil-works/pi-tui';
import { ConfigStore, placement } from './config.ts';
import { type LineName, PUBLISH_CHANNEL, type Publication, REQUEST_CHANNEL } from './contract.ts';
import { layout } from './layout.ts';
import { publisherKey, validate } from './validate.ts';

let hidden = false;
const lines = ['above', 'below'] as const;

export default function statusBars(pi: ExtensionAPI) {
  const publications = new Map<string, Publication>();
  const warned = new Set<string>();
  const pendingWarnings = new Set<string>();
  const mounted = new Map<LineName, TUI | undefined>();
  const countdowns = new Map<LineName, boolean>();
  let context: ExtensionContext | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let stopped = false;
  const config = new ConfigStore(join(getAgentDir(), 'status-bars.json'), (message) =>
    context?.ui.notify(message, 'warning'),
  );
  const segments = () => [...publications.values()].flatMap((publication) => publication.segments);

  function stopClock() {
    if (timer) clearInterval(timer);
    timer = undefined;
  }
  function clock() {
    const needed = !hidden && [...countdowns.values()].some(Boolean);
    if (!needed) stopClock();
    else if (!timer) {
      timer = setInterval(refresh, 30_000);
      timer.unref();
    }
  }
  function refresh() {
    if (!context || stopped || context.mode !== 'tui') return;
    const overrides = config.read();
    const all = segments();
    for (const line of lines) {
      const visible =
        !hidden &&
        all.some((segment) => {
          const effective = placement(segment, overrides);
          return (
            effective.line === line &&
            !effective.hidden &&
            segment.forms.full.some((part) =>
              'text' in part
                ? !!part.text
                : part.kind === 'diff'
                  ? !!(part.additions || part.deletions)
                  : true,
            )
          );
        });
      if (!visible) {
        if (mounted.has(line)) context.ui.setWidget(`status-bars.${line}`, undefined);
        mounted.delete(line);
        countdowns.delete(line);
      } else if (!mounted.has(line)) {
        mounted.set(line, undefined);
        context.ui.setWidget(
          `status-bars.${line}`,
          (tui, theme) => {
            mounted.set(line, tui);
            let previousConfig = overrides;
            return {
              render(width) {
                if (stopped || hidden) return [];
                const current = config.read();
                const output = layout(
                  segments(),
                  current,
                  line,
                  width,
                  Date.now(),
                  theme,
                  getCapabilities().hyperlinks,
                );
                countdowns.set(line, output.countdown);
                clock();
                // Reconcile placement changes discovered by the stat-cached render check.
                if (current !== previousConfig) {
                  previousConfig = current;
                  queueMicrotask(refresh);
                }
                return output.rows;
              },
              invalidate() {},
            };
          },
          { placement: line === 'above' ? 'aboveEditor' : 'belowEditor' },
        );
      }
    }
    for (const tui of new Set(mounted.values())) tui?.requestRender();
    clock();
  }
  const unsubscribe = pi.events.on(PUBLISH_CHANNEL, (payload) => {
    if (stopped) return;
    const publication = validate(payload);
    if (!publication) {
      const publisher = publisherKey(payload);
      if (!warned.has(publisher)) {
        warned.add(publisher);
        const message = `Ignoring invalid status-bars publication from ${publisher}.`;
        if (context) context.ui.notify(message, 'warning');
        else pendingWarnings.add(message);
      }
      return;
    }
    publications.set(publication.publisher, publication);
    countdowns.clear();
    refresh();
  });
  pi.on('session_start', (_event, ctx) => {
    context = ctx;
    stopped = false;
    publications.clear();
    warned.clear();
    config.resetWarnings();
    countdowns.clear();
    stopClock();
    for (const line of lines) ctx.ui.setWidget(`status-bars.${line}`, undefined);
    mounted.clear();
    for (const message of pendingWarnings) ctx.ui.notify(message, 'warning');
    pendingWarnings.clear();
    refresh();
    pi.events.emit(REQUEST_CHANNEL, { version: 1 });
  });
  pi.on('session_shutdown', (_event, ctx) => {
    stopped = true;
    unsubscribe();
    stopClock();
    publications.clear();
    countdowns.clear();
    mounted.clear();
    for (const line of lines) ctx.ui.setWidget(`status-bars.${line}`, undefined);
    context = undefined;
  });
  pi.registerShortcut('alt+u', {
    description: 'Show or hide all status bar lines',
    handler: async () => {
      hidden = !hidden;
      countdowns.clear();
      refresh();
    },
  });
}
