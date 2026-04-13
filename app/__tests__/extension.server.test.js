import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  graphql: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
}));

vi.mock("../db.server", () => ({
  default: {
    session: {
      findUnique: mocks.findUnique,
      update: mocks.update,
    },
  },
}));

vi.mock("../shopify.server", () => ({
  authenticate: {
    admin: vi.fn(),
  },
}));

import { updateWebPixel, registerWebPixel } from "../services/extension.server.js";
import { authenticate } from "../shopify.server";

describe("extension.server.js web pixel", () => {
  const session = { id: "session-1", shop: "test.myshopify.com" };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SHOPIFY_APP_URL = "https://ab-insightful.fly.dev";
    authenticate.admin.mockResolvedValue({
      admin: { graphql: mocks.graphql },
      session,
    });
  });

  it("updateWebPixel recovers from NOT_FOUND by fetching Shopify id and retries update", async () => {
    let webPixelIdInDb = "gid://shopify/WebPixel/stale";
    mocks.findUnique.mockImplementation(() =>
      Promise.resolve({ id: session.id, webPixelId: webPixelIdInDb }),
    );
    mocks.update.mockImplementation(async ({ data }) => {
      if ("webPixelId" in data) webPixelIdInDb = data.webPixelId;
      return {};
    });

    const responses = [
      {
        data: {
          webPixelUpdate: {
            userErrors: [
              {
                code: "NOT_FOUND",
                field: ["id"],
                message:
                  "The web pixel with the ID used as the input value couldn't be found.",
              },
            ],
          },
        },
      },
      {
        data: {
          webPixel: {
            id: "gid://shopify/WebPixel/fresh",
            settings: {},
          },
        },
      },
      {
        data: {
          webPixelUpdate: {
            userErrors: [],
            webPixel: {
              id: "gid://shopify/WebPixel/fresh",
              settings: { appUrl: "https://ab-insightful.fly.dev" },
            },
          },
        },
      },
    ];
    let i = 0;
    mocks.graphql.mockImplementation(async () => ({
      json: async () => responses[i++],
    }));

    const res = await updateWebPixel({ request: {} });
    expect(res.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: session.id },
        data: { webPixelId: null },
      }),
    );
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: session.id },
        data: { webPixelId: "gid://shopify/WebPixel/fresh" },
      }),
    );
    expect(mocks.graphql).toHaveBeenCalledTimes(3);
  });

  it("updateWebPixel recovers from NOT_FOUND via registerWebPixel when Shopify has no pixel", async () => {
    let webPixelIdInDb = "gid://shopify/WebPixel/stale";
    mocks.findUnique.mockImplementation(() =>
      Promise.resolve({ id: session.id, webPixelId: webPixelIdInDb }),
    );
    mocks.update.mockImplementation(async ({ data }) => {
      if ("webPixelId" in data) webPixelIdInDb = data.webPixelId;
      return {};
    });

    const responses = [
      {
        data: {
          webPixelUpdate: {
            userErrors: [{ code: "NOT_FOUND", field: ["id"], message: "missing" }],
          },
        },
      },
      { data: { webPixel: null } },
      {
        data: {
          webPixelCreate: {
            userErrors: [],
            webPixel: {
              id: "gid://shopify/WebPixel/created",
              settings: {},
            },
          },
        },
      },
      {
        data: {
          webPixelUpdate: {
            userErrors: [],
            webPixel: {
              id: "gid://shopify/WebPixel/created",
              settings: { appUrl: "https://ab-insightful.fly.dev" },
            },
          },
        },
      },
    ];
    let i = 0;
    mocks.graphql.mockImplementation(async () => ({
      json: async () => responses[i++],
    }));

    const res = await updateWebPixel({ request: {} });
    expect(res.status).toBe(200);
    expect(mocks.graphql).toHaveBeenCalledTimes(4);
  });

  it("registerWebPixel replaces stale DB id when Shopify returns a different id", async () => {
    mocks.findUnique.mockResolvedValue({
      id: session.id,
      webPixelId: "gid://shopify/WebPixel/stale",
    });
    mocks.update.mockResolvedValue({});

    mocks.graphql.mockImplementation(async () => ({
      json: async () => ({
        data: {
          webPixel: {
            id: "gid://shopify/WebPixel/canonical",
            settings: {},
          },
        },
      }),
    }));

    const res = await registerWebPixel({ request: {} });
    expect(res.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: session.id },
      data: { webPixelId: "gid://shopify/WebPixel/canonical" },
    });
    expect(mocks.graphql).toHaveBeenCalledTimes(1);
  });

  it("registerWebPixel clears stale id and creates when Shopify has no pixel", async () => {
    let webPixelIdInDb = "gid://shopify/WebPixel/ghost";
    mocks.findUnique.mockImplementation(() =>
      Promise.resolve({ id: session.id, webPixelId: webPixelIdInDb }),
    );
    mocks.update.mockImplementation(async ({ data }) => {
      if ("webPixelId" in data) webPixelIdInDb = data.webPixelId;
      return {};
    });

    const responses = [
      { data: { webPixel: null } },
      {
        data: {
          webPixelCreate: {
            userErrors: [],
            webPixel: {
              id: "gid://shopify/WebPixel/new",
              settings: {},
            },
          },
        },
      },
    ];
    let i = 0;
    mocks.graphql.mockImplementation(async () => ({
      json: async () => responses[i++],
    }));

    const res = await registerWebPixel({ request: {} });
    expect(res.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: session.id },
      data: { webPixelId: null },
    });
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: session.id },
      data: { webPixelId: "gid://shopify/WebPixel/new" },
    });
  });
});
