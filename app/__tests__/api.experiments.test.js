// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/experiment.server", () => ({
  GetFrontendExperimentsData: vi.fn(),
}));

import { GetFrontendExperimentsData } from "../services/experiment.server";
import { loader } from "../routes/api.experiments.jsx";

describe("api.experiments route loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 204 for OPTIONS and echoes CORS preflight headers", async () => {
    const request = new Request("http://localhost/api/experiments", {
      method: "OPTIONS",
      headers: {
        Origin: "https://store.example",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "X-Test, Content-Type",
      },
    });

    const response = await loader({ request });

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://store.example");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, OPTIONS");
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe("X-Test, Content-Type");
    expect(response.headers.get("Access-Control-Allow-Private-Network")).toBe("true");
    expect(GetFrontendExperimentsData).not.toHaveBeenCalled();
  });

  it("returns 200 and experiments payload for GET", async () => {
    const experiments = [
      { experimentId: 1, name: "Homepage CTA" },
      { experimentId: 2, name: "Pricing Banner" },
    ];
    GetFrontendExperimentsData.mockResolvedValue(experiments);

    const request = new Request("http://localhost/api/experiments", {
      method: "GET",
      headers: {
        Origin: "https://store.example",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "Authorization",
      },
    });

    const response = await loader({ request });

    expect(GetFrontendExperimentsData).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://store.example");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, OPTIONS");
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe("Authorization");
    expect(response.headers.get("Access-Control-Allow-Private-Network")).toBe("true");
    await expect(response.json()).resolves.toEqual(experiments);
  });

  it("returns 404 with error payload when GET finds no experiments", async () => {
    GetFrontendExperimentsData.mockResolvedValue([]);

    const request = new Request("http://localhost/api/experiments", {
      method: "GET",
    });

    const response = await loader({ request });

    expect(GetFrontendExperimentsData).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(404);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, OPTIONS");
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type");
    expect(response.headers.get("Access-Control-Allow-Private-Network")).toBe("true");
    await expect(response.json()).resolves.toEqual({
      error: "No active experiments were found",
    });
  });

  it("returns 404 when GET service returns null", async () => {
    GetFrontendExperimentsData.mockResolvedValue(null);

    const request = new Request("http://localhost/api/experiments", {
      method: "GET",
    });

    const response = await loader({ request });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "No active experiments were found",
    });
  });

  it("returns null for unsupported methods", async () => {
    const request = new Request("http://localhost/api/experiments", {
      method: "POST",
    });

    const response = await loader({ request });

    expect(response).toBeNull();
    expect(GetFrontendExperimentsData).not.toHaveBeenCalled();
  });
});
