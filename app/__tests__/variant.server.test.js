import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
}));

vi.mock("../db.server", () => ({
  default: {
    variant: {
      findMany: mocks.findMany,
    },
  },
}));

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

    mocks.findMany.mockResolvedValue(rows);

    const result = await getVariants(2001);

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { experimentId: 2001 },
    });
    expect(result).toEqual(rows);
  });

  it("returns an empty array when no variants exist", async () => {
    mocks.findMany.mockResolvedValue([]);

    const result = await getVariants(9999);

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { experimentId: 9999 },
    });
    expect(result).toEqual([]);
  });

  it("passes through undefined expId to the db query shape", async () => {
    mocks.findMany.mockResolvedValue([]);

    const result = await getVariants(undefined);

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { experimentId: undefined },
    });
    expect(result).toEqual([]);
  });

  it("throws when db.variant.findMany rejects", async () => {
    mocks.findMany.mockRejectedValue(new Error("db failure"));

    await expect(getVariants(2001)).rejects.toThrow("db failure");
  });
});
