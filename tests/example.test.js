import { describe, test, expect } from '@jest/globals';
import fc from 'fast-check';

describe('Example Test Suite', () => {
  test('should pass basic test', () => {
    expect(1 + 1).toBe(2);
  });

  test('property-based test example with fast-check', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        // Commutative property of addition
        return a + b === b + a;
      })
    );
  });
});
