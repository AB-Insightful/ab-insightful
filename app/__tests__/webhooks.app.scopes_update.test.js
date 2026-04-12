import { describe, it, expect, vi, beforeEach } from "vitest";
import { action } from "../routes/webhooks.app.scopes_update";
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
      update: vi.fn(),
    },
  },
}));


describe("webhooks.app.scopes_update action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates session scope when session exists", async () => {
    authenticate.webhook.mockResolvedValue({
      payload: { current: ["read_products", "write_products"] },
      session: { id: "session-123" },
      topic: "APP_SCOPES_UPDATE",
      shop: "test-shop.myshopify.com",
    });

    const request = new Request("https://example.com/webhooks");

    const response = await action({ request });

    expect(authenticate.webhook).toHaveBeenCalledWith(request);
    expect(db.session.update).toHaveBeenCalledWith({
      where: {
        id: "session-123",
      },
      data: {
        scope: "read_products,write_products",
      },
    });
    expect(response).toBeInstanceOf(Response);
  });

  it("does not update the database when session is missing", async () => {
    authenticate.webhook.mockResolvedValue({
      payload: { current: ["read_products"] },
      session: null,
      topic: "APP_SCOPES_UPDATE",
      shop: "test-shop.myshopify.com",
    });

    const request = new Request("https://example.com/webhooks");

    const response = await action({ request });

    expect(authenticate.webhook).toHaveBeenCalledWith(request);
    expect(db.session.update).not.toHaveBeenCalled();
    expect(response).toBeInstanceOf(Response);
  });

  it("saves current as a string via toString()", async () => {
    authenticate.webhook.mockResolvedValue({
      payload: { current: ["scope_one", "scope_two"] },
      session: { id: "session-456" },
      topic: "APP_SCOPES_UPDATE",
      shop: "test-shop.myshopify.com",
    });

    const request = new Request("https://example.com/webhooks");

    await action({ request });

    expect(db.session.update).toHaveBeenCalledWith({
      where: { id: "session-456" },
      data: { scope: "scope_one,scope_two" },
    });
  });
});