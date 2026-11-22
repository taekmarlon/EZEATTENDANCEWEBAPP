import { describe, it, expect } from 'vitest';
import { getInitials } from './image';

describe('image utilities', () => {
  it('computes clean initials for single-word, multi-word, and blank names', () => {
    expect(getInitials('Lincoln High School')).toBe('LS');
    expect(getInitials('STEM')).toBe('ST');
    expect(getInitials('   ')).toBe('?');
  });
});
