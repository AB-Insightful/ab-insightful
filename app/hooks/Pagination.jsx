//UI elements for pagination (next, prev buttons, page info)
export default function Pagination({ currentPage, setCurrentPage, totalPages, startIndex, totalItems, itemsPerPage }) {

  const hasItems = totalItems > 0;
  const displayStart = hasItems ? startIndex + 1 : 0;
  const displayEnd = hasItems ? Math.min(startIndex + itemsPerPage, totalItems) : 0;

  return (
    <>
      <div style={{ margin: "10px 0" }}>
        <s-paragraph>
          <s-text>
            Showing {displayStart}–{displayEnd} of {totalItems} experiments
            {hasItems && totalPages > 1 && ` (Page ${currentPage} of ${totalPages})`}
          </s-text>
        </s-paragraph>
      </div>
      <s-button-group>
        <s-button
          slot="secondary-actions"
          onClick={() => setCurrentPage(p => p - 1)}
          disabled={currentPage <= 1 || !hasItems}
        >Previous</s-button>
        <s-button
          slot="secondary-actions"
          onClick={() => setCurrentPage(p => p + 1)}
          disabled={currentPage >= totalPages || !hasItems}
        >Next</s-button>
      </s-button-group>
    </>
  );
}