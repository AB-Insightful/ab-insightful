import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

// Helper to mimic the fetch Request object
function makeRequest(method, headers = {}) {
  return new Request("http://localhost/api/cron/execute-analysis", {
    method,
    headers,
  });
}

// Helper to parse response JSON safely
async function readJson(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

describe("routes/api.cron.execute-analysis.jsx loader", () => {
  const originalEnv = process.env;
  let createAnalysisSnapshot;

  async function importLoaderWithMocks() {
    vi.resetModules();

    createAnalysisSnapshot = vi.fn();

    vi.doMock("../services/analysis.server", () => ({
      createAnalysisSnapshot,
    }));

    const mod = await import("../routes/api.cron.execute-analysis.jsx");
    return mod.loader;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.NODE_ENV = "production";
    process.env.CRON_SECRET = "test-secret";

    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  test("OPTIONS: returns 204 with CORS + Allow headers", async () => {
    const loader = await importLoaderWithMocks();
    const request = makeRequest("OPTIONS");

    const response = await loader({ request });

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "cron.process.ab-insightful.internal"
    );
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain("Cron-Secret");
  });

  test("GET: unauthorized when secret is wrong", async () => {
    const loader = await importLoaderWithMocks();
    const request = makeRequest("GET", { "Cron-Secret": "wrong-key" });

    const response = await loader({ request });
    const body = await readJson(response);

    expect(response.status).toBe(401);
    expect(body.ok).toBe(false);
    expect(createAnalysisSnapshot).not.toHaveBeenCalled();
  });

  test("GET: success calls service and returns 200 + results", async () => {
    const loader = await importLoaderWithMocks();
    const mockData = { totalProcessed: 5, status: "complete" };
    createAnalysisSnapshot.mockResolvedValue(mockData);

    const request = makeRequest("GET", { "Cron-Secret": "test-secret" });
    const response = await loader({ request });
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toEqual(mockData);
    expect(createAnalysisSnapshot).toHaveBeenCalledTimes(1);
  });

  test("GET: failure (service error) returns 500 + logs stack", async () => {
    const loader = await importLoaderWithMocks();
    const error = new Error("Monte Carlo simulation crashed");
    createAnalysisSnapshot.mockRejectedValue(error);

    const request = makeRequest("GET", { "Cron-Secret": "test-secret" });
    const response = await loader({ request });
    const body = await readJson(response);

    expect(response.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Monte Carlo simulation crashed");
    
    // stack trace logged to stderr
    expect(console.error).toHaveBeenCalled();
  });

  test("POST: returns 405 Method Not Allowed", async () => {
    const loader = await importLoaderWithMocks();
    const request = makeRequest("POST", { "Cron-Secret": "test-secret" });

    const response = await loader({ request });
    expect(response.status).toBe(405);
  });
});