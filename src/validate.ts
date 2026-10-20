import { Value } from 'typebox/value';
import { type Part, type Publication, PublicationSchema } from './contract.ts';

export function sanitize(text: string): string {
  return Array.from(text, (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || (code >= 127 && code <= 159) || code === 0x2028 || code === 0x2029
      ? ' '
      : character;
  }).join('');
}

export function safeUrl(url: string): boolean {
  if (sanitize(url) !== url) return false;
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

function cleanPart(part: Part): Part {
  if ('text' in part) {
    return { ...part, text: sanitize(part.text) };
  }
  return { ...part };
}

export function validate(payload: unknown): Publication | undefined {
  try {
    if (!Value.Check(PublicationSchema, payload)) return undefined;
    const ids = new Set<string>();
    for (const segment of payload.segments) {
      if (!segment.id.startsWith(`${payload.publisher}.`) || ids.has(segment.id)) return undefined;
      ids.add(segment.id);
    }
    return {
      version: 1,
      publisher: payload.publisher,
      segments: payload.segments.map((segment) => ({
        ...segment,
        forms: Object.fromEntries(
          Object.entries(segment.forms).map(([level, parts]) => [level, parts.map(cleanPart)]),
        ) as typeof segment.forms,
      })),
    };
  } catch {
    return undefined;
  }
}

export function publisherKey(payload: unknown): string {
  try {
    if (
      payload &&
      typeof payload === 'object' &&
      'publisher' in payload &&
      typeof payload.publisher === 'string' &&
      /^[a-z][a-z0-9-]{0,31}$/.test(payload.publisher)
    ) {
      return payload.publisher;
    }
  } catch {}
  return '<unknown>';
}
