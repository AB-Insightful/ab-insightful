// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../services/experiment.server.js", () => ({
  handleCollectedEvent: vi.fn(),
}));

import { handleCollectedEvent } from "../../services/experiment.server.js";
import { loader, action } from "../../routes/api.collect.jsx";

describe("api.collect route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("loader", () => {
    it("returns 204 for OPTIONS with CORS headers", async () => {
      const request = new Request("http://localhost/api/collect", {
        method: "OPTIONS",
      });

      const response = await loader({ request });

      expect(response.status).toBe(204);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
        "POST, OPTIONS",
      );
      expect(response.headers.get("Access-Control-Allow-Headers")).toBe(
        "Content-Type",
      );
    });

    it("returns null for non-OPTIONS requests", async () => {
      const request = new Request("http://localhost/api/collect", {
        method: "GET",
      });

      const response = await loader({ request });

      expect(response).toBeNull();
    });
  });

  describe("action", () => {
    it("returns 204 for OPTIONS with CORS headers", async () => {
      const request = new Request("http://localhost/api/collect", {
        method: "OPTIONS",
      });

      const response = await action({ request });

      expect(response.status).toBe(204);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
        "POST, OPTIONS",
      );
      expect(response.headers.get("Access-Control-Allow-Headers")).toBe(
        "Content-Type",
      );

      expect(handleCollectedEvent).not.toHaveBeenCalled();
    });

    it("parses POST json, calls handleCollectedEvent, and returns 200 null", async () => {
      const payload = {
        event_type: "experiment_include",
        client_id: "route-test-user",
        experiment_id: 2001,
        experimentId: 2001,
        variant: "Control",
        device_type: "mobile",
        timestamp: "2026-03-04T09:00:00.000Z",
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
      expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
        "POST, OPTIONS",
      );
      expect(response.headers.get("Access-Control-Allow-Headers")).toBe(
        "Content-Type",
      );

      const body = await response.json();
      expect(body).toBeNull();
    });

    it("still returns 200 even if handleCollectedEvent rejects later because it is not awaited", async () => {
      handleCollectedEvent.mockRejectedValueOnce(
        new Error("background failure"),
      );

      const payload = {
        event_type: "experiment_include",
        client_id: "route-test-user-2",
        experiment_id: 2001,
        experimentId: 2001,
        variant: "Control",
        device_type: "desktop",
        timestamp: "2026-03-04T09:05:00.000Z",
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

      const body = await response.json();
      expect(body).toBeNull();
    });

    it("throws when POST body is invalid JSON", async () => {
      const request = new Request("http://localhost/api/collect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: "{ not valid json",
      });

      await expect(action({ request })).rejects.toThrow();
      expect(handleCollectedEvent).not.toHaveBeenCalled();
    });
  });
});
