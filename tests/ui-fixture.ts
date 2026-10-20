import type { ExtensionUIContext, Theme } from '@earendil-works/pi-coding-agent';
import type { Component, TUI } from '@earendil-works/pi-tui';
import { plain } from './fixture.ts';

export function uiFixture() {
  const components = new Map<string, Component>();
  const warnings: string[] = [];
  const placements = new Map<string, string>();
  let renders = 0;
  const tui = {
    requestRender() {
      renders++;
    },
  } as TUI;
  type Factory = (tui: TUI, theme: Theme) => Component;
  const ui = {
    notify(message: string) {
      warnings.push(message);
    },
    setWidget(key: string, content: Factory | undefined, options?: { placement: string }) {
      if (!content) {
        components.delete(key);
        return;
      }
      placements.set(key, options?.placement ?? '');
      components.set(key, content(tui, plain as Theme));
    },
    setFooter() {
      throw new Error('footer must remain untouched');
    },
    setHeader() {
      throw new Error('header must remain untouched');
    },
    setStatus() {
      throw new Error('status texts must remain untouched');
    },
  } as unknown as ExtensionUIContext;
  return {
    ui,
    components,
    warnings,
    placements,
    get renders() {
      return renders;
    },
    render(width = 80) {
      return [...components.entries()].flatMap(([key, component]) =>
        component.render(width).map((row) => ({ key, row })),
      );
    },
  };
}
