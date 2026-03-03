import { describe, it, expect } from 'vitest';
import { formatImprovement, formatProbability, formatRatio } from '../utils/formatters';

describe('Formatter Utilities', () => {
  
  describe('formatImprovement', () => {
    it('returns N/A for null or undefined', () => {
      expect(formatImprovement(null)).toBe('N/A');
      expect(formatImprovement(undefined)).toBe('N/A');
    });

    it('adds a + sign for positive numbers and fixes to 2 decimals', () => {
      expect(formatImprovement(5.235)).toBe('+5.24%');
    });

    it('handles negative numbers correctly', () => {
      expect(formatImprovement(-2.1)).toBe('-2.10%');
    });
  });

  describe('formatProbability', () => {
    it('returns N/A for null/undefined', () => {
      expect(formatProbability(null)).toBe('N/A');
    });

    it('converts decimal to percentage string', () => {
      expect(formatProbability(0.8567)).toBe('85.7%');
    });
  });

  describe('formatRatio', () => {
    it('returns N/A if either input is null/undefined', () => {
      expect(formatRatio(null, 100)).toBe('N/A');
      expect(formatRatio(10, null)).toBe('N/A');
    });

    it('returns a formatted ratio string', () => {
      expect(formatRatio(5, 50)).toBe('5/50');
    });
  });
});