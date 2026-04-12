import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db.server", () => ({
  default: {
    variant: {
      findMany: vi.fn(),
    },
  },
}));

import db from "../db.server";
import { getVariants } from "../services/variant.server";

describe("getVariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns variants for a valid experiment id", async () => {
    const rows = [
      { id: 1, experimentId: 2001, name: "Control" },
      { id: 2, experimentId: 2001, name: "Variant A" },
    ];

    db.variant.findMany.mockResolvedValue(rows);

    const result = await getVariants(2001);

    expect(db.variant.findMany).toHaveBeenCalledWith({
      where: { experimentId: 2001 },
    });
    expect(result).toEqual(rows);
  });

  it("returns an empty array when no variants exist", async () => {
    db.variant.findMany.mockResolvedValue([]);

    const result = await getVariants(9999);

    expect(db.variant.findMany).toHaveBeenCalledWith({
      where: { experimentId: 9999 },
    });
    expect(result).toEqual([]);
  });

  it("passes through undefined expId to the db query shape", async () => {
    db.variant.findMany.mockResolvedValue([]);

    const result = await getVariants(undefined);

    expect(db.variant.findMany).toHaveBeenCalledWith({
      where: { experimentId: undefined },
    });
    expect(result).toEqual([]);
  });

  it("throws when db.variant.findMany rejects", async () => {
    db.variant.findMany.mockRejectedValue(new Error("db failure"));

    await expect(getVariants(2001)).rejects.toThrow("db failure");
  });
});
