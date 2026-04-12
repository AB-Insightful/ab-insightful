import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const findManyMock = vi.fn();

vi.mock("../db.server", () => ({
  default: {
    variant: {
      findMany: findManyMock,
    },
  },
}));

let getVariants;

beforeAll(async () => {
  const mod = await import("../services/variant.server.js");
  getVariants = mod.getVariants;
});

describe("variant.server.js", () => {
  beforeEach(() => {
    findManyMock.mockReset();
  });

  it("returns variants for the requested experiment id", async () => {
    const variants = [
      { id: 11, experimentId: 42, name: "Control" },
      { id: 12, experimentId: 42, name: "Variant A" },
    ];
    findManyMock.mockResolvedValue(variants);

    const result = await getVariants(42);

    expect(findManyMock).toHaveBeenCalledTimes(1);
    expect(findManyMock).toHaveBeenCalledWith({
      where: {
        experimentId: 42,
      },
    });
    expect(result).toEqual(variants);
  });

  it("returns an empty array when no variants are found", async () => {
    findManyMock.mockResolvedValue([]);

    const result = await getVariants(77);

    expect(findManyMock).toHaveBeenCalledTimes(1);
    expect(findManyMock).toHaveBeenCalledWith({
      where: {
        experimentId: 77,
      },
    });
    expect(result).toEqual([]);
  });
});