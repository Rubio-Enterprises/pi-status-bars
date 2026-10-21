import { ConfigFile, type ConfigRead } from 'pi-core-kit/config-file';
import { Type } from 'typebox';
import { Value } from 'typebox/value';
import { type LineName, LineNameSchema, type Segment, ZoneNameSchema } from './contract.ts';

const OverrideSchema = Type.Object({
  line: Type.Optional(LineNameSchema),
  zone: Type.Optional(ZoneNameSchema),
  order: Type.Optional(Type.Number()),
  priority: Type.Optional(Type.Number()),
  hidden: Type.Optional(Type.Boolean()),
});
export type Override = Partial<Pick<Segment, 'line' | 'zone' | 'order' | 'priority'>> & {
  hidden?: boolean;
};
export type Config = ReadonlyMap<string, Override> & {
  readonly lines?: Partial<Record<LineName, { maxRows: number }>>;
};
export function maxRows(config: Config, line: LineName): number {
  return config.lines?.[line]?.maxRows ?? (line === 'below' ? 2 : 1);
}
const fields = ['line', 'zone', 'order', 'priority', 'hidden'] as const;
const idPattern = /^[a-z][a-z0-9-]*\.[a-z0-9][a-z0-9.-]*$/;

export function parseConfig(input: unknown, warn: (message: string) => void): Config {
  const config: Map<string, Override> & Pick<Config, 'lines'> = new Map();
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    warn('Invalid status-bars.json: expected an object; using no overrides.');
    return config;
  }
  if ('lines' in input) {
    if (!input.lines || typeof input.lines !== 'object' || Array.isArray(input.lines)) {
      warn('Invalid status-bars.json lines: expected an object.');
    } else {
      const lines: NonNullable<Config['lines']> = {};
      for (const line of ['above', 'below'] as const) {
        if (!(line in input.lines)) continue;
        const entry = (input.lines as Record<string, unknown>)[line];
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          warn(`Invalid status-bars.json lines.${line}; ignoring it.`);
          continue;
        }
        if (!('maxRows' in entry)) continue;
        if (
          typeof entry.maxRows !== 'number' ||
          !Number.isInteger(entry.maxRows) ||
          entry.maxRows < 1 ||
          entry.maxRows > 4
        ) {
          warn(`Invalid status-bars.json lines.${line}.maxRows; expected an integer 1–4.`);
          continue;
        }
        lines[line] = { maxRows: entry.maxRows };
      }
      if (Object.keys(lines).length) Object.assign(config, { lines });
    }
  }
  if (!('segments' in input)) return config;
  if (!input.segments || typeof input.segments !== 'object' || Array.isArray(input.segments)) {
    warn('Invalid status-bars.json segments: expected exact segment IDs.');
    return config;
  }
  for (const [id, entry] of Object.entries(input.segments)) {
    if (id.length > 64 || !idPattern.test(id) || !Value.Check(OverrideSchema, entry)) {
      warn(`Invalid status-bars.json entry "${id}"; ignoring it.`);
      continue;
    }
    config.set(
      id,
      Object.fromEntries(
        fields.filter((key) => entry[key] !== undefined).map((key) => [key, entry[key]]),
      ),
    );
  }
  return config;
}

export function placement(segment: Segment, config: Config) {
  const override = config.get(segment.id);
  return {
    line: override?.line ?? segment.line,
    zone: override?.zone ?? segment.zone,
    order: override?.order ?? segment.order,
    priority: override?.priority ?? segment.priority,
    hidden: override?.hidden ?? false,
  };
}

export class ConfigStore {
  private readonly file: ConfigFile;
  private seen: ConfigRead | undefined;
  private config: Config = new Map();
  private warned = new Set<string>();
  constructor(
    readonly path: string,
    private notify: (message: string) => void,
  ) {
    this.file = new ConfigFile(path);
  }

  /** Forget warnings already shown, so the next read warns again for the same problem. */
  resetWarnings() {
    this.warned.clear();
    this.seen = undefined;
  }
  private warn = (message: string) => {
    if (this.warned.has(message)) return;
    this.warned.add(message);
    this.notify(message);
  };

  read(): Config {
    const outcome = this.file.read();
    if (outcome === this.seen) return this.config;
    this.seen = outcome;
    if (outcome.status === 'value') this.config = parseConfig(outcome.value, this.warn);
    else {
      this.config = new Map();
      if (outcome.status === 'invalid')
        this.warn(
          'Cannot read status-bars.json; using no overrides. Check its JSON and permissions.',
        );
    }
    return this.config;
  }
}
