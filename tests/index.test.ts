import { expect, test } from 'bun:test';
import statusBars from '../src/index.ts';

test('exports an extension factory', () => {
  expect(typeof statusBars).toBe('function');
});
