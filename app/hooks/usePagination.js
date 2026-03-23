//all of the calculations used for usage of pagination functionality
import { useState, useEffect } from "react";

export function usePagination(items = [], itemsPerPage) {
  const [currentPage, setCurrentPage] = useState(1);
  const safeItems = Array.isArray(items) ? items : [];

  const totalPages = Math.max(1, Math.ceil(safeItems.length / itemsPerPage));
  const clampedPage = Math.min(Math.max(currentPage, 1), totalPages);

  //reset to page 1 whenever the list size changes
  useEffect(() => {
    setCurrentPage(1);
  }, [safeItems.length]);


  const startIndex = (clampedPage - 1) * itemsPerPage;
  const paginatedItems = safeItems.slice(startIndex, startIndex + itemsPerPage);

  return { currentPage: clampedPage, setCurrentPage, totalPages, startIndex, paginatedItems };
}