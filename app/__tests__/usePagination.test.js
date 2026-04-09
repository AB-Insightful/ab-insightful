import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { usePagination } from '../hooks/usePagination';

describe('usePagination', () => {
  it('handles empty items safely', () => {
    const { result } = renderHook(() => usePagination([], 5));

    expect(result.current.currentPage).toBe(1);
    expect(result.current.totalPages).toBe(1);
    expect(result.current.paginatedItems).toEqual([]);
  });

  it('paginates correctly', () => {
    const items = Array.from({ length: 10 }, (_, i) => i + 1);

    const { result } = renderHook(() => usePagination(items, 5));

    expect(result.current.paginatedItems).toEqual([1,2,3,4,5]);

    act(() => result.current.setCurrentPage(2));

    expect(result.current.paginatedItems).toEqual([6,7,8,9,10]);
  });

  it('resets page when items shrink', () => {
    const { result, rerender } = renderHook(
      ({ items }) => usePagination(items, 5),
      { initialProps: { items: Array.from({ length: 10 }, (_, i) => i) } }
    );

    act(() => result.current.setCurrentPage(2));

    rerender({ items: [1, 2] });

    expect(result.current.currentPage).toBe(1);
  });
});