import type { Theme } from '@earendil-works/pi-coding-agent';
import { hyperlink, truncateToWidth } from '@earendil-works/pi-tui';
import type { Part, Status } from './contract.ts';
import type { DetailLevel } from './layout.ts';
import { safeUrl } from './validate.ts';

export type PartTheme = Pick<Theme, 'fg' | 'underline'>;
const colors = { ok: 'success', warn: 'warning', critical: 'error', muted: 'muted' } as const;

export function countdown(at: number, now: number): string {
  const minutes = Math.max(0, Math.ceil((at - now) / 60_000));
  if (!minutes) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h${minutes % 60 ? `${minutes % 60}m` : ''}`;
  return `${Math.floor(hours / 24)}d${hours % 24 ? `${hours % 24}h` : ''}`;
}

export function meter(fraction: number, status: Status, theme: PartTheme): string {
  const filled = Math.round(fraction * 6);
  if (!filled) return theme.fg('dim', '╶────╴');
  if (filled === 6) return theme.fg(colors[status], '╺━━━━╸');
  return (
    theme.fg(colors[status], `╺${'━'.repeat(filled - 1)}`) +
    theme.fg('dim', `${'─'.repeat(5 - filled)}╴`)
  );
}

export function renderPart(
  part: Part,
  level: DetailLevel,
  now: number,
  theme: PartTheme,
  hyperlinks: boolean,
  room?: number,
): string {
  const text =
    'text' in part ? (room === undefined ? part.text : truncateToWidth(part.text, room, '…')) : '';
  if ('text' in part && !text) return '';
  switch (part.kind) {
    case 'label':
      return theme.fg('muted', text);
    case 'value':
      return part.status ? theme.fg(colors[part.status], text) : text;
    case 'note':
      return theme.fg('dim', text);
    case 'link': {
      if (!safeUrl(part.url)) return text;
      const styled = theme.fg('mdLinkUrl', theme.underline(text));
      return hyperlinks ? hyperlink(styled, part.url) : styled;
    }
    case 'meter':
      return level === 'full' || level === 'compact'
        ? meter(part.fraction, part.status, theme)
        : '';
    case 'countdown': {
      if (level === 'minimal') return '';
      const duration = countdown(part.at, now);
      const shown =
        level === 'terse' ? (duration.match(/^\d+[dhm]|^now/)?.[0] ?? duration) : duration;
      return theme.fg('muted', `↻${level === 'full' ? ' ' : ''}${shown}`);
    }
    case 'diff':
      return part.additions || part.deletions
        ? theme.fg('toolDiffAdded', `+${part.additions}`) +
            theme.fg('toolDiffRemoved', `-${part.deletions}`)
        : '';
    case 'separator':
      return theme.fg('dim', ' | ');
  }
}

export function joinParts(parts: Array<{ part: Part; text: string }>): string {
  let result = '';
  let previousSeparator = false;
  for (const { part, text } of parts) {
    if (!text) continue;
    const separator = part.kind === 'separator';
    result += (result && !separator && !previousSeparator ? ' ' : '') + text;
    previousSeparator = separator;
  }
  return result;
}
