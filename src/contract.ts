import { type Static, Type } from 'typebox';

export const CONTRACT_VERSION = 1;
export const PUBLISH_CHANNEL = 'status-bars:publish';
export const REQUEST_CHANNEL = 'status-bars:request';
export const DETAIL_LEVELS = ['full', 'compact', 'terse', 'minimal'] as const;

const Text = Type.String({ maxLength: 200 });
const Elastic = { elastic: Type.Optional(Type.Boolean()) };

export const DetailLevelSchema = Type.Union(DETAIL_LEVELS.map((level) => Type.Literal(level)));
export const LineNameSchema = Type.Union([Type.Literal('above'), Type.Literal('below')]);
export const ZoneNameSchema = Type.Union([Type.Literal('left'), Type.Literal('right')]);
export const StatusSchema = Type.Union([
  Type.Literal('ok'),
  Type.Literal('warn'),
  Type.Literal('critical'),
  Type.Literal('muted'),
]);

export const PartSchema = Type.Union([
  Type.Object({ kind: Type.Literal('label'), text: Text, ...Elastic }),
  Type.Object({
    kind: Type.Literal('value'),
    text: Text,
    status: Type.Optional(StatusSchema),
    ...Elastic,
  }),
  Type.Object({
    kind: Type.Literal('meter'),
    fraction: Type.Number({ minimum: 0, maximum: 1 }),
    status: StatusSchema,
  }),
  Type.Object({ kind: Type.Literal('countdown'), at: Type.Number() }),
  Type.Object({ kind: Type.Literal('note'), text: Text, ...Elastic }),
  Type.Object({ kind: Type.Literal('link'), text: Text, url: Type.String({ maxLength: 2048 }), ...Elastic }),
  Type.Object({
    kind: Type.Literal('diff'),
    additions: Type.Integer({ minimum: 0 }),
    deletions: Type.Integer({ minimum: 0 }),
  }),
  Type.Object({ kind: Type.Literal('separator') }),
]);

const Form = Type.Array(PartSchema, { maxItems: 24 });

export const SegmentSchema = Type.Object({
  id: Type.String({ pattern: '^[a-z][a-z0-9-]*\\.[a-z0-9][a-z0-9.-]*$', maxLength: 64 }),
  line: LineNameSchema,
  zone: ZoneNameSchema,
  order: Type.Number(),
  priority: Type.Number(),
  forms: Type.Object({
    full: Form,
    compact: Type.Optional(Form),
    terse: Type.Optional(Form),
    minimal: Type.Optional(Form),
  }),
});

export const PublicationSchema = Type.Object({
  version: Type.Literal(CONTRACT_VERSION),
  publisher: Type.String({ pattern: '^[a-z][a-z0-9-]*$', maxLength: 32 }),
  segments: Type.Array(SegmentSchema, { maxItems: 16 }),
});

export const RequestSchema = Type.Object({ version: Type.Literal(CONTRACT_VERSION) });

export type DetailLevel = Static<typeof DetailLevelSchema>;
export type LineName = Static<typeof LineNameSchema>;
export type ZoneName = Static<typeof ZoneNameSchema>;
export type Status = Static<typeof StatusSchema>;
export type Part = Static<typeof PartSchema>;
export type Segment = Static<typeof SegmentSchema>;
export type Publication = Static<typeof PublicationSchema>;
export type Request = Static<typeof RequestSchema>;
