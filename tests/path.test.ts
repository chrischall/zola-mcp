import { describe, it, expect } from 'vitest';
import { pathSegment } from '../src/path.js';

describe('pathSegment', () => {
  it('passes an ordinary id through unchanged', () => {
    expect(pathSegment('3f2a9c1e-0b7d-4c55-9e2a-1f0d5b6c7a88')).toBe('3f2a9c1e-0b7d-4c55-9e2a-1f0d5b6c7a88');
    expect(pathSegment(5108495)).toBe('5108495');
  });

  it('percent-encodes "/", "?", "#" and whitespace so an id cannot add segments or a query', () => {
    expect(pathSegment('../../v3/users/me?')).not.toMatch(/[/?#]/);
    expect(pathSegment('a/b')).toBe('a%2Fb');
    expect(pathSegment('a?b#c')).toBe('a%3Fb%23c');
    expect(pathSegment('a b')).toBe('a%20b');
  });

  it.each(['', '.', '..'])('rejects the dot-segment / empty id %j (fetch would resolve it)', (bad) => {
    expect(() => pathSegment(bad)).toThrow(/path segment/i);
  });
});
