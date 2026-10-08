import { describe, expect, it } from 'vitest';
import { getPhoneVariants, normalizePhone } from './phone';

describe('phone normalization', () => {
  it('treats national and country-code forms as the same phone', () => {
    expect(normalizePhone('(19) 98335-0939')).toBe('19983350939');
    expect(normalizePhone('5519983350939')).toBe('19983350939');
    expect(getPhoneVariants('5519983350939')).toEqual(['19983350939', '5519983350939']);
  });

  it('does not guess for invalid or non-Brazilian lengths', () => {
    expect(normalizePhone('abc')).toBe('');
    expect(normalizePhone('12345')).toBe('12345');
    expect(getPhoneVariants('12345')).toEqual(['12345']);
  });
});