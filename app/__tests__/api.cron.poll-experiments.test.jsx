// app/__tests__/api.cron.poll-experiments.test.jsx
// Assumptions:
// - Node/Remix runtime provides global Request/Response (jsdom environment does).
// - Production code has been updated so:
//   - "no experiments" branch uses started_experiments.length === 0
//   - loops use for..of and call start/end with experiment.id
//   - response payload keys are: started_experiments, ended_experiments, failures
//   - Content-Type typo "application.json" in the non-empty branch is preserved

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

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

  // service fns (recreated/mocked per test after vi.resetModules)
  let getCandidatesForScheduledEnd;
  let getCandidatesForScheduledStart;
  let getCandidatesForStableSuccessEnd;
  let endExperiment;
  let startExperiment;
  const mockProjectFindUnique = vi.fn();

  async function importLoaderWithMocks() {
    vi.resetModules();

    getCandidatesForScheduledEnd = vi.fn();
    getCandidatesForScheduledStart = vi.fn();
    getCandidatesForStableSuccessEnd = vi.fn();
    endExperiment = vi.fn();
    startExperiment = vi.fn();

    vi.doMock("../services/experiment.server", () => ({
        getCandidatesForScheduledEnd,
        getCandidatesForScheduledStart,
        getCandidatesForStableSuccessEnd,
        endExperiment,
        startExperiment,
    }));

    // Add this — db is used directly in the cron for project flag gating
    vi.doMock("../db.server", () => ({
        default: {
            project: { findUnique: mockProjectFindUnique },
        },
    }));

    // Also mock notifications.server so sendEmail* don't fire for real
    vi.doMock("../services/notifications.server", () => ({
        sendEmailStart: vi.fn(),
        sendEmailEnd: vi.fn(),
        sendSMSStart: vi.fn(),
        sendSMSEnd: vi.fn()
    }));

    const mod = await import("../routes/api.cron.poll-experiments.jsx");
    return mod.loader;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: flag off, so no email sends during cron tests that don't care about it
    mockProjectFindUnique.mockResolvedValue({
        enableExperimentStart: false,
        enableExperimentEnd: false,
        shop: "test.myshopify.com",
    });

    process.env = { ...originalEnv };
    process.env.NODE_ENV = "production";
    process.env.CRON_SECRET = "test-secret";
    delete process.env.ORIGIN;

    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  test("OPTIONS: returns 204 with CORS + Allow headers", async () => {
    const loader = await importLoaderWithMocks();

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
  });

  test("GET: unauthorized when Cron-Secret header does not match env.CRON_SECRET", async () => {
    const loader = await importLoaderWithMocks();

    const request = makeRequest("GET", {
      "Cron-Secret": "wrong",
      Origin: "cron.process.ab-insightful.internal",
    });

    const response = await loader({ request });

    expect(response.status).toBe(401);
    const body = await readJson(response);
    expect(body.ok).toBe(false);
  });

  test("GET: success (no experiments to start or end) returns 200 + message", async () => {
    const loader = await importLoaderWithMocks();

    getCandidatesForScheduledEnd.mockResolvedValue([]);
    getCandidatesForScheduledStart.mockResolvedValue([]);
    getCandidatesForStableSuccessEnd.mockResolvedValue([]);

    const request = makeRequest("GET", {
      "Cron-Secret": "test-secret",
      Origin: "cron.process.ab-insightful.internal",
    });

    const response = await loader({ request });

    expect(response.status).toBe(200);
    const body = await readJson(response);
    expect(body.message).toBe("No experiments needed to be started or ended");
  });

  test("GET: success (experiments present) calls start/end and returns 200", async () => {
    const loader = await importLoaderWithMocks();

    const started = [{ id: 101 }, { id: 102 }];
    const ended = [{ id: 201 }];

    getCandidatesForScheduledStart.mockResolvedValue(started);
    getCandidatesForScheduledEnd.mockResolvedValue(ended);
    getCandidatesForStableSuccessEnd.mockResolvedValue([]);

    startExperiment.mockResolvedValue(undefined);
    endExperiment.mockResolvedValue(undefined);

    const request = makeRequest("GET", {
      "Cron-Secret": "test-secret",
      Origin: "cron.process.ab-insightful.internal",
    });

    const response = await loader({ request });
    expect(response.status).toBe(200);
    expect(startExperiment).toHaveBeenCalledTimes(2);
    expect(endExperiment).toHaveBeenCalledTimes(1);
  });

  test("GET: development mode logs received request", async () => {
    process.env.NODE_ENV = "development";
    process.env.ORIGIN = "http://dev-origin.example";
    process.env.CRON_SECRET = "secret";

    const loader = await importLoaderWithMocks();

    getCandidatesForScheduledEnd.mockResolvedValue([]);
    getCandidatesForScheduledStart.mockResolvedValue([]);
    getCandidatesForStableSuccessEnd.mockResolvedValue([]);

    const request = makeRequest("GET", {
      "Cron-Secret": "secret",
    });

    const response = await loader({ request });
    expect(response.status).toBe(200);
    expect(console.log).toHaveBeenCalled();
  });

  test("non-OPTIONS/GET: returns 405", async () => {
    const loader = await importLoaderWithMocks();
    const request = makeRequest("POST", { "Cron-Secret": "test-secret" });
    const response = await loader({ request });
    expect(response.status).toBe(405);
  });

  test("GET: success (stable winner present) terminates experiment and returns 200", async () => {
    const loader = await importLoaderWithMocks();
    const stableWinners = [{ id: 301, name: "Stable Winner", projectId: 1 }];
    
    getCandidatesForScheduledStart.mockResolvedValue([]);
    getCandidatesForScheduledEnd.mockResolvedValue([]);
    getCandidatesForStableSuccessEnd.mockResolvedValue(stableWinners); 

    endExperiment.mockResolvedValue({ id: 301 });

    const request = makeRequest("GET", {
        "Cron-Secret": "test-secret",
        Origin: "cron.process.ab-insightful.internal",
    });

    const response = await loader({ request });
    const body = await readJson(response);

    expect(endExperiment).toHaveBeenCalledWith(301);
    expect(body.ok).toBe(true);
  });

  // --- SMS Notification Tests ---

  test("GET: sends SMS start notification when enabled", async () => {
    vi.resetModules();
    const sendSMSStart = vi.fn();
    const startExperiment = vi.fn().mockResolvedValue(undefined);

    mockProjectFindUnique.mockResolvedValue({
      enableExperimentStart: true,
      emailNotifEnabled: false,
      smsNotifEnabled: true,
      shop: "test.myshopify.com",
    });

    vi.doMock("../services/experiment.server", () => ({
      getCandidatesForScheduledEnd: vi.fn().mockResolvedValue([]),
      getCandidatesForScheduledStart: vi.fn().mockResolvedValue([{ id: 101, name: "Exp A", projectId: 55 }]),
      getCandidatesForStableSuccessEnd: vi.fn().mockResolvedValue([]), // Critical fix for ET-570
      endExperiment: vi.fn(),
      startExperiment,
    }));

    vi.doMock("../db.server", () => ({
      default: { project: { findUnique: mockProjectFindUnique } },
    }));

    vi.doMock("../services/notifications.server", () => ({
      sendEmailStart: vi.fn(),
      sendSMSStart,
      sendEmailEnd: vi.fn(),
      sendSMSEnd: vi.fn(),
    }));

    const { loader } = await import("../routes/api.cron.poll-experiments.jsx");
    const response = await loader({
      request: makeRequest("GET", { "Cron-Secret": "test-secret" }),
    });

    expect(response.status).toBe(200);
    expect(startExperiment).toHaveBeenCalledWith(101);
    expect(sendSMSStart).toHaveBeenCalledWith(101, "Exp A", "test.myshopify.com");
    expect(sendEmailStart).not.toHaveBeenCalled();
  });

  test("GET: records failure when sendSMSStart throws", async () => {
    vi.resetModules();
    const sendSMSStart = vi.fn().mockRejectedValue(new Error("sms failed"));

    mockProjectFindUnique.mockResolvedValue({
      enableExperimentStart: true,
      emailNotifEnabled: false,
      smsNotifEnabled: true,
      shop: "test.myshopify.com",
    });

    vi.doMock("../services/experiment.server", () => ({
      getCandidatesForScheduledEnd: vi.fn().mockResolvedValue([]),
      getCandidatesForScheduledStart: vi.fn().mockResolvedValue([{ id: 101, name: "Exp A", projectId: 55 }]),
      getCandidatesForStableSuccessEnd: vi.fn().mockResolvedValue([]), // Critical fix for ET-570
      endExperiment: vi.fn(),
      startExperiment: vi.fn().mockResolvedValue(undefined),
    }));

    vi.doMock("../db.server", () => ({
      default: { project: { findUnique: mockProjectFindUnique } },
    }));

    vi.doMock("../services/notifications.server", () => ({
      sendEmailStart: vi.fn(),
      sendSMSStart,
      sendEmailEnd: vi.fn(),
      sendSMSEnd: vi.fn(),
    }));

    const { loader } = await import("../routes/api.cron.poll-experiments.jsx");
    const response = await loader({
      request: makeRequest("GET", { "Cron-Secret": "test-secret" }),
    });

    const body = await readJson(response);
    expect(body.failures).toContain("sms failed");
  });

}); // Correctly closes the describe block for all tests