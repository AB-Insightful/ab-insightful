import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../services/experiment.server", () => ({
  handleCollectedEvent: vi.fn(),
}));

import { handleCollectedEvent } from "../services/experiment.server";
import { action, loader } from "../routes/api.collect.jsx";

describe("api.collect", () => {
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

    vi.mocked(handleCollectedEvent).mockResolvedValue(undefined);

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
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type");

    const body = await response.json();
    expect(body).toBeNull();
  });

  it("handles OPTIONS preflight in action", async () => {
    const request = new Request("http://localhost/api/collect", {
      method: "OPTIONS",
    });

    const response = await action({ request });

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type");
    expect(handleCollectedEvent).not.toHaveBeenCalled();
  });

  it("returns 500 when handleCollectedEvent throws", async () => {
    const payload = {
      event_type: "experiment_include",
      client_id: "test123",
    };

    vi.mocked(handleCollectedEvent).mockRejectedValue(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const request = new Request("http://localhost/api/collect", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const response = await action({ request });
    const body = await response.json();

    expect(handleCollectedEvent).toHaveBeenCalledTimes(1);
    expect(handleCollectedEvent).toHaveBeenCalledWith(payload);

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Event processing failed" });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("handles OPTIONS in loader", async () => {
    const request = new Request("http://localhost/api/collect", {
      method: "OPTIONS",
    });

    const response = await loader({ request });

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("returns null from loader for non-OPTIONS requests", async () => {
    const request = new Request("http://localhost/api/collect", {
      method: "GET",
    });

    const response = await loader({ request });

    expect(response).toBeNull();
  });
});