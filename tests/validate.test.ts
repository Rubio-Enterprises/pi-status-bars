import { expect, test } from 'bun:test';
import { Value } from 'typebox/value';
import { DETAIL_LEVELS, PublicationSchema, RequestSchema } from '../src/contract.ts';
import { publisherKey, sanitize, validate } from '../src/validate.ts';
import { publication, segment, text } from './fixture.ts';

test('frozen schema and request are runtime-valid', () => {
  expect(DETAIL_LEVELS).toEqual(['full', 'compact', 'terse', 'minimal']);
  expect(Value.Check(PublicationSchema, publication())).toBe(true);
  expect(Value.Check(RequestSchema, { version: 1 })).toBe(true);
});
test.each([
  { version: 2 },
  { publisher: 'INVALID' },
  { segments: [segment('other.one')] },
  { segments: [segment(), segment()] },
  { segments: Array.from({ length: 17 }, (_, i) => segment(`fake.${i}`)) },
  {
    segments: [
      segment('fake.one', { forms: { full: Array.from({ length: 25 }, () => text('x')) } }),
    ],
  },
  { segments: [segment('fake.one', { forms: { full: [text('x'.repeat(201))] } })] },
  { segments: [segment('fake.one', { order: NaN })] },
  { segments: [segment('fake.one', { priority: Infinity })] },
  {
    segments: [
      segment('fake.one', { forms: { full: [{ kind: 'meter', fraction: 1.1, status: 'ok' }] } }),
    ],
  },
  {
    segments: [
      segment('fake.one', { forms: { full: [{ kind: 'diff', additions: -1, deletions: 0 }] } }),
    ],
  },
])('rejects whole invalid publication %#', (patch) => {
  expect(validate({ ...publication(), ...patch })).toBeUndefined();
});
test.each(['compact', 'terse', 'minimal'] as const)(
  'accepts schema-valid undefined optional form %s and leaves it absent',
  (level) => {
    const p = publication([
      segment('fake.one', { forms: { full: [text('hello\nworld')], [level]: undefined } }),
    ]);
    expect(Value.Check(PublicationSchema, p)).toBe(true);
    const valid = validate(p);
    expect(valid?.segments[0]?.forms).toEqual({ full: [text('hello world')] });
    expect(Value.Check(PublicationSchema, valid)).toBe(true);
  },
);
test('requires an own full form even when the schema accepts an inherited full', () => {
  const forms = Object.create({ full: [text('inherited')] });
  const p = publication([segment('fake.one', { forms })]);
  expect(Value.Check(PublicationSchema, p)).toBe(true);
  expect(() => validate(p)).not.toThrow();
  expect(validate(p)).toBeUndefined();
});
test('copies recognized own forms including non-enumerable full, not inherited or extra forms', () => {
  const forms = Object.defineProperty(Object.create({ compact: [text('inherited')] }), 'full', {
    value: [text('own\nfull')],
  });
  forms.terse = [text('own\nterse')];
  forms.extra = [text('extra')];
  const p = publication([segment('fake.one', { forms })]);
  expect(Value.Check(PublicationSchema, p)).toBe(true);
  const valid = validate(p);
  expect(valid?.segments[0]?.forms).toEqual({
    full: [text('own full')],
    terse: [text('own terse')],
  });
  expect(Value.Check(PublicationSchema, valid)).toBe(true);
});
test('limits are inclusive and publication is sanitized without mutating publisher data', () => {
  const s = segment('fake.one', { forms: { full: [text('a\n\t\u001b\u009b\u2028b')] } });
  const p = publication([s]);
  const valid = validate(p);
  expect(valid?.segments[0]?.forms.full[0]).toEqual(text('a     b'));
  expect(s.forms.full[0]).toEqual(text('a\n\t\u001b\u009b\u2028b'));
  expect(
    validate(
      publication(
        Array.from({ length: 16 }, (_, i) =>
          segment(`fake.${i}`, {
            forms: { full: Array.from({ length: 24 }, () => text('x'.repeat(200))) },
          }),
        ),
      ),
    ),
  ).toBeDefined();
  expect(sanitize('中文 é 😀')).toBe('中文 é 😀');
});
test('malformed and hostile values never throw', () => {
  const cycle: Record<string, unknown> = {};
  cycle.segments = cycle;
  const hostile = new Proxy(
    {},
    {
      get() {
        throw new Error('hostile');
      },
      has() {
        throw new Error('hostile');
      },
    },
  );
  const inputs: unknown[] = [
    null,
    undefined,
    true,
    1,
    'fake',
    [],
    {},
    cycle,
    hostile,
    BigInt(1),
    Symbol('x'),
    () => {},
  ];
  for (let i = 0; i < 300; i++)
    inputs.push({
      version: i % 3,
      publisher: i % 2 ? 'fake' : null,
      segments: [
        {
          id: `fake.${i}`,
          forms: {
            full: [{ kind: ['label', 'value', 'meter'][i % 3], text: i, fraction: i / 100 }],
          },
        },
      ],
    });
  for (const input of inputs) {
    expect(() => validate(input)).not.toThrow();
    expect(validate(input)).toBeUndefined();
    expect(() => publisherKey(input)).not.toThrow();
  }
});
