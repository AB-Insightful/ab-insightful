import { describe, it, expect } from "vitest";
import { sortRows, getNextSort } from "../utils/sortExperimentsList";

describe("sortRows", () => {
  const rows = [
    {
      id: 1,
      name: "Beta",
      status: "paused",
      count: 20,
      createdAt: "2026-03-20T10:00:00Z",
    },
    {
      id: 2,
      name: "Alpha",
      status: "active",
      count: 5,
      createdAt: "2026-03-18T10:00:00Z",
    },
    {
      id: 3,
      name: "Gamma",
      status: "completed",
      count: 12,
      createdAt: "2026-03-22T10:00:00Z",
    },
  ];

  it("returns empty array for non-array input", () => {
    expect(sortRows(null, "name")).toEqual([]);
    expect(sortRows(undefined, "name")).toEqual([]);
    expect(sortRows({}, "name")).toEqual([]);
  });

  it("sorts strings descending by default", () => {
    const result = sortRows(rows, "name");
    expect(result.map((row) => row.name)).toEqual(["Gamma", "Beta", "Alpha"]);
  });

  it("sorts strings ascending", () => {
    const result = sortRows(rows, "name", "asc");
    expect(result.map((row) => row.name)).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("sorts numbers ascending", () => {
    const result = sortRows(rows, "count", "asc");
    expect(result.map((row) => row.count)).toEqual([5, 12, 20]);
  });

  it("sorts numbers descending", () => {
    const result = sortRows(rows, "count", "desc");
    expect(result.map((row) => row.count)).toEqual([20, 12, 5]);
  });

  it("sorts dates ascending", () => {
    const result = sortRows(rows, "createdAt", "asc");
    expect(result.map((row) => row.id)).toEqual([2, 1, 3]);
  });

  it("sorts dates descending", () => {
    const result = sortRows(rows, "createdAt", "desc");
    expect(result.map((row) => row.id)).toEqual([3, 1, 2]);
  });

  it("supports function accessors", () => {
    const result = sortRows(
      rows,
      (row) => row.name.length,
      "asc",
    );

    expect(result.map((row) => row.name)).toEqual(["Beta", "Alpha", "Gamma"]);
  });

  it("pushes null values to the end", () => {
    const result = sortRows(
      [
        { id: 1, value: 10 },
        { id: 2, value: null },
        { id: 3, value: 5 },
      ],
      "value",
      "asc",
    );

    expect(result.map((row) => row.id)).toEqual([3, 1, 2]);
  });
});

describe("getNextSort", () => {
  it("defaults new column to desc", () => {
    expect(getNextSort("status", "name", "asc")).toEqual({
      sortKey: "status",
      sortDirection: "desc",
    });
  });

  it("toggles desc to asc on same column", () => {
    expect(getNextSort("name", "name", "desc")).toEqual({
      sortKey: "name",
      sortDirection: "asc",
    });
  });

  it("toggles asc to desc on same column", () => {
    expect(getNextSort("name", "name", "asc")).toEqual({
      sortKey: "name",
      sortDirection: "desc",
    });
  });
});