export function sortRows(rows, accessor, direction = "desc") {
  if (!Array.isArray(rows)) return [];

  const getValue =
    typeof accessor === "function"
      ? accessor
      : (row) => row?.[accessor];

  const sorted = [...rows].sort((a, b) => {
    const aVal = getValue(a);
    const bVal = getValue(b);

    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;

    if (typeof aVal === "number" && typeof bVal === "number") {
      return aVal - bVal;
    }

    const aDate = new Date(aVal);
    const bDate = new Date(bVal);
    const aIsDate = !Number.isNaN(aDate.getTime());
    const bIsDate = !Number.isNaN(bDate.getTime());

    if (aIsDate && bIsDate) {
      return aDate - bDate;
    }

    return String(aVal).localeCompare(String(bVal), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });

  return direction === "asc" ? sorted : sorted.reverse();
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