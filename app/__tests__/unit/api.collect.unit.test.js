import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../services/experiment.server", () => ({
  handleCollectedEvent: vi.fn(),
}));

import { handleCollectedEvent } from "../../services/experiment.server.js";
import { action } from "../../routes/api.collect.jsx";

describe("api.collect action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses JSON, calls handleCollectedEvent, and returns 200", async () => {
    const payload = {
      event_type: "experiment_include",
      client_id: "test123",
      experiment_id: 2001,
      experimentId: 2001,
      variant: "Control",
      device_type: "mobile",
      timestamp: "2026-03-04T08:20:00.000Z",
    };

    const request = new Request("http://localhost/api/collect", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const response = await action({ request });

    expect(handleCollectedEvent).toHaveBeenCalledTimes(1);
    expect(handleCollectedEvent).toHaveBeenCalledWith(payload);

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");

    const body = await response.json();
    expect(body).toBeNull();
  });

  it("handles OPTIONS preflight", async () => {
    const request = new Request("http://localhost/api/collect", {
      method: "OPTIONS",
    });

    const response = await action({ request });

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(handleCollectedEvent).not.toHaveBeenCalled();
  });
});
