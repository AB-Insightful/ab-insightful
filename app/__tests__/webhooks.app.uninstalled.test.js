// app/__tests__/webhooks.app.uninstalled.test.js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { action } from "../routes/webhooks.app.uninstalled";
import { authenticate } from "../shopify.server";
import db from "../db.server";

vi.mock("../shopify.server", () => ({
  authenticate: {
    webhook: vi.fn(),
  },
}));

vi.mock("../db.server", () => ({
  default: {
    session: {
      deleteMany: vi.fn(),
    },
  },
}));

describe("webhooks.app.uninstalled action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  //AB insightful app should delete all sessions when it is uninstalled
  it("deletes all sessions for the shop when session exists", async () => {
    authenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      session: { id: "session-123" },
      topic: "APP_UNINSTALLED",
    });

    const request = new Request("https://example.com/webhooks");

    const response = await action({ request });

    expect(authenticate.webhook).toHaveBeenCalledWith(request);
    expect(db.session.deleteMany).toHaveBeenCalledWith({
      where: { shop: "test-shop.myshopify.com" },
    });
    expect(response).toBeInstanceOf(Response);
  });


  it("does not delete sessions when session is missing", async () => {
    authenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      session: null,
      topic: "APP_UNINSTALLED",
    });

    const request = new Request("https://example.com/webhooks");

    const response = await action({ request });

    expect(authenticate.webhook).toHaveBeenCalledWith(request);
    expect(db.session.deleteMany).not.toHaveBeenCalled();
    expect(response).toBeInstanceOf(Response);
  });


  it("returns a Response", async () => {
    authenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      session: { id: "session-999" },
      topic: "APP_UNINSTALLED",
    });

    const request = new Request("https://example.com/webhooks");

    const response = await action({ request });

    expect(response).toBeInstanceOf(Response);
  });
});