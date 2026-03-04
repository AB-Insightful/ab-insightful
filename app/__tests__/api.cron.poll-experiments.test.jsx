// app/__tests__/api.cron.poll-experiments.test.jsx
// Assumptions:
// - Node/Remix runtime provides global Request/Response (jsdom environment does).
// - We only test current production behavior (including the for..in loop calling start/end with undefined ids).

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { loader } from "../routes/api.cron.poll-experiments.jsx";

const getCandidatesForScheduledEnd = vi.fn();
const getCandidatesForScheduledStart = vi.fn();
const endExperiment = vi.fn();
const startExperiment = vi.fn();

vi.mock("../services/experiment.server", () => ({
  getCandidatesForScheduledEnd,
  getCandidatesForScheduledStart,
  endExperiment,
  startExperiment,
}));

function makeRequest(method, headers = {}) {
  return new Request("http://localhost/api/cron/poll-experiments", {
    method,
    headers,
  });
}

async function readJson(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

describe("routes/api.cron.poll-experiments.jsx loader", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();

    // isolate env mutations per test
    process.env = { ...originalEnv };
    process.env.NODE_ENV = "production";
    process.env.CRON_SECRET = "secret";
    delete process.env.ORIGIN;

    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    getCandidatesForScheduledEnd.mockResolvedValue(null);
    getCandidatesForScheduledStart.mockResolvedValue(null);
    endExperiment.mockResolvedValue(undefined);
    startExperiment.mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  test("OPTIONS: returns 204 with CORS + Allow headers", async () => {
    const request = makeRequest("OPTIONS", {
      Origin: "cron.process.ab-insightful.internal",
    });

    const response = await loader({ request });

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(204);

    expect(response.headers.get("Allow")).toBe("OPTIONS, GET, HEAD");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "cron.process.ab-insightful.internal",
    );
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
      "OPTIONS, GET, HEAD",
    );
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe(
      "Cron-Secret, Content-Type",
    );

    expect(console.log).toHaveBeenCalledWith("hit options");
  });

  test("GET: unauthorized when Cron-Secret header does not match env.CRON_SECRET", async () => {
    const request = makeRequest("GET", {
      "Cron-Secret": "wrong",
      Origin: "cron.process.ab-insightful.internal",
    });

    const response = await loader({ request });

    expect(response.status).toBe(401);
    expect(response.headers.get("Content-Type")).toBe("application/json");

    const body = await readJson(response);
    expect(body).toEqual({
      ok: false,
      message: "Unauthorized. Please supply your CRON Secret",
    });

    expect(getCandidatesForScheduledEnd).not.toHaveBeenCalled();
    expect(getCandidatesForScheduledStart).not.toHaveBeenCalled();
    expect(startExperiment).not.toHaveBeenCalled();
    expect(endExperiment).not.toHaveBeenCalled();
  });

  test("GET: forbidden when Origin is not internal (production)", async () => {
    const request = makeRequest("GET", {
      "Cron-Secret": "secret",
      Origin: "https://evil.example",
    });

    const response = await loader({ request });

    expect(response.status).toBe(403);
    expect(response.headers.get("Content-Type")).toBe("application/json");

    const body = await readJson(response);
    expect(body).toEqual({
      ok: false,
      message:
        "Only internal Requests are allowed. It's bad that you are seeing this.",
    });

    expect(getCandidatesForScheduledEnd).not.toHaveBeenCalled();
    expect(getCandidatesForScheduledStart).not.toHaveBeenCalled();
  });

  test("GET: success (no experiments to start or end) returns 200 + message", async () => {
    const request = makeRequest("GET", {
      "Cron-Secret": "secret",
      Origin: "cron.process.ab-insightful.internal",
    });

    getCandidatesForScheduledEnd.mockResolvedValue(null);
    getCandidatesForScheduledStart.mockResolvedValue(null);

    const response = await loader({ request });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json");

    const body = await readJson(response);
    expect(body).toEqual({
      ok: true,
      message: "No experiments needed to be started or ended",
    });

    expect(getCandidatesForScheduledEnd).toHaveBeenCalledTimes(1);
    expect(getCandidatesForScheduledStart).toHaveBeenCalledTimes(1);
    expect(startExperiment).not.toHaveBeenCalled();
    expect(endExperiment).not.toHaveBeenCalled();
  });

  test("GET: success (experiments present) calls start/end and returns 200 with payload (header typo preserved)", async () => {
    const request = makeRequest("GET", {
      "Cron-Secret": "secret",
      Origin: "cron.process.ab-insightful.internal",
    });

    const started = [{ id: 101 }, { id: 102 }];
    const ended = [{ id: 201 }];

    getCandidatesForScheduledStart.mockResolvedValue(started);
    getCandidatesForScheduledEnd.mockResolvedValue(ended);

    const response = await loader({ request });

    expect(response.status).toBe(200);
    // Production code returns "application.json" (typo). Test current behavior.
    expect(response.headers.get("Content-Type")).toBe("application.json");

    const body = await readJson(response);
    expect(body).toEqual({
      ok: true,
      start_experiments: started,
      end_experiments: ended,
    });

    // NOTE: production loop uses `for (const experiment in started_experiments)`
    // and then uses `experiment.id`, so it passes undefined (key string has no id).
    expect(startExperiment).toHaveBeenCalledTimes(2);
    expect(startExperiment).toHaveBeenNthCalledWith(1, undefined);
    expect(startExperiment).toHaveBeenNthCalledWith(2, undefined);

    expect(endExperiment).toHaveBeenCalledTimes(1);
    expect(endExperiment).toHaveBeenCalledWith(undefined);
  });

  test("GET: development mode logs received request and uses env.ORIGIN for origin check", async () => {
    process.env.NODE_ENV = "development";
    process.env.ORIGIN = "http://dev-origin.example";
    process.env.CRON_SECRET = "secret";

    const request = makeRequest("GET", {
      "Cron-Secret": "secret",
      Origin: "https://ignored-in-dev.example",
    });

    getCandidatesForScheduledEnd.mockResolvedValue(null);
    getCandidatesForScheduledStart.mockResolvedValue(null);

    const response = await loader({ request });

    expect(response.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(
      "[poll-experiments] received request: ",
      request,
    );
  });

  test("non-OPTIONS/GET: returns 405", async () => {
    const request = makeRequest("POST", {
      "Cron-Secret": "secret",
      Origin: "cron.process.ab-insightful.internal",
    });

    const response = await loader({ request });

    expect(response.status).toBe(405);
    const bodyText = await response.text();
    expect(bodyText).toBe("");
  });
});
