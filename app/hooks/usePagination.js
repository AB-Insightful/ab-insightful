//all of the calculations used for usage of pagination functionality
import { useState, useEffect } from "react";

export function usePagination(items = [], itemsPerPage) {
  const [currentPage, setCurrentPage] = useState(1);
  const safeItems = items || [];

  //reset to page 1 whenever the list size changes
  useEffect(() => {
    setCurrentPage(1);
  }, [safeItems.length]);

  const totalPages = Math.ceil(safeItems.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedItems = safeItems.slice(startIndex, startIndex + itemsPerPage);

  return { currentPage, setCurrentPage, totalPages, startIndex, paginatedItems };
}