export function sortRows(rows, accessor, direction = "desc") {
  if (!Array.isArray(rows)) return [];

  const getValue =
    typeof accessor === "function"
      ? accessor
      : (row) => row?.[accessor];

  return [...rows].sort((a, b) => {
    const aVal = getValue(a);
    const bVal = getValue(b);

    const aMissing = aVal == null;
    const bMissing = bVal == null;

    // always keep missing values at the bottom
    if (aMissing && bMissing) return 0;
    if (aMissing) return 1;
    if (bMissing) return -1;

    let comparison = 0;

    if (typeof aVal === "number" && typeof bVal === "number") {
      comparison = aVal - bVal;
    } else {
      const aDate = new Date(aVal);
      const bDate = new Date(bVal);
      const aIsDate = !Number.isNaN(aDate.getTime());
      const bIsDate = !Number.isNaN(bDate.getTime());

      if (aIsDate && bIsDate) {
        comparison = aDate - bDate;
      } else {
        comparison = String(aVal).localeCompare(String(bVal), undefined, {
          numeric: true,
          sensitivity: "base",
        });
      }
    }

    return direction === "asc" ? comparison : -comparison;
  });
}

export function getNextSort(clickedKey, currentKey, currentDirection = "desc") {
  if (clickedKey !== currentKey) {
    return {
      sortKey: clickedKey,
      sortDirection: "desc",
    };
  }

  return {
    sortKey: clickedKey,
    sortDirection: currentDirection === "desc" ? "asc" : "desc",
  };
}