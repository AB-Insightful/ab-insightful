//UI elements for pagination (next, prev buttons, page info)
export default function Pagination({ currentPage, setCurrentPage, totalPages, startIndex, totalItems, itemsPerPage }) {
  return (
    <>
      <div style={{ margin: "10px 0" }}>
        <s-paragraph>
          <s-text>
            Showing {startIndex + 1}–{Math.min(startIndex + itemsPerPage, totalItems)} of {totalItems} experiments
            {totalPages > 1 && ` (Page ${currentPage} of ${totalPages})`}
          </s-text>
        </s-paragraph>
      </div>
      <s-button-group>
        <s-button
          slot="secondary-actions"
          onClick={() => setCurrentPage(p => p - 1)}
          disabled={currentPage === 1}
        >Previous</s-button>
        <s-button
          slot="secondary-actions"
          onClick={() => setCurrentPage(p => p + 1)}
          disabled={currentPage === totalPages}
        >Next</s-button>
      </s-button-group>
    </>
  );
}