import { beforeEach, describe, expect, it, vi } from "vitest";

const { findFirst } = vi.hoisted(() => ({
  findFirst: vi.fn(),
}));

vi.mock("../db.server", () => ({
  default: {
    session: {
      findFirst,
    },
  },
}));

import { webPixelNotNull } from "../services/session.server";

describe("webPixelNotNull", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when a session has a non-null webPixelId", async () => {
    findFirst.mockResolvedValue({ id: "session-1", webPixelId: "pixel-1" });

    await expect(webPixelNotNull()).resolves.toBe(true);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        webPixelId: {
          not: null,
        },
      },
    });
  });

  it("returns false when no session has a non-null webPixelId", async () => {
    findFirst.mockResolvedValue(null);

    await expect(webPixelNotNull()).resolves.toBe(false);
  });
});