//check if the sectionId in the side pannel of create experiment and edit experiment
//are cut down to 30 characters (so that icon can render at proper size)
import { describe, it, expect } from 'vitest';

const truncateSectionId = (sectionId) =>
  sectionId
    ? sectionId.slice(0, 30) + (sectionId.length > 30 ? '...' : '')
    : 'Section not selected';

describe('variant sectionId truncation', () => {
  it('truncates a sectionId longer than 30 characters and appends ellipsis', () => {
    const longId = 'shopify-section-template--20293268209888__hero-_jVaWmY';
    expect(truncateSectionId(longId)).toBe('shopify-section-template--2029...');
  });

  it('does not append ellipsis when sectionId is exactly 30 characters', () => {
    const exactId = 'shopify-section-template--2029';
    expect(truncateSectionId(exactId)).toBe(exactId);
  });

  it('does not truncate sectionId under 30 characters', () => {
    const shortId = 'short-section-id';
    expect(truncateSectionId(shortId)).toBe(shortId);
  });

  it('returns "Section not selected" when sectionId is falsy', () => {
    expect(truncateSectionId('')).toBe('Section not selected');
    expect(truncateSectionId(null)).toBe('Section not selected');
  });
});