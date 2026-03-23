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
  let endExperiment;
  let startExperiment;
  const mockProjectFindUnique = vi.fn();

  async function importLoaderWithMocks() {
    vi.resetModules();

    getCandidatesForScheduledEnd = vi.fn();
    getCandidatesForScheduledStart = vi.fn();
    endExperiment = vi.fn();
    startExperiment = vi.fn();

    vi.doMock("../services/experiment.server", () => ({
        getCandidatesForScheduledEnd,
        getCandidatesForScheduledStart,
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
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
      "OPTIONS, GET, HEAD",
    );
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe(
      "Cron-Secret, Content-Type",
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

  test("GET: success (no experiments to start or end) returns 200 + message", async () => {
    const loader = await importLoaderWithMocks();

    getCandidatesForScheduledEnd.mockResolvedValue([]);
    getCandidatesForScheduledStart.mockResolvedValue([]);

    const request = makeRequest("GET", {
      "Cron-Secret": "test-secret",
      Origin: "cron.process.ab-insightful.internal",
    });

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
    const loader = await importLoaderWithMocks();

    const started = [{ id: 101 }, { id: 102 }];
    const ended = [{ id: 201 }];

    getCandidatesForScheduledStart.mockResolvedValue(started);
    getCandidatesForScheduledEnd.mockResolvedValue(ended);

    startExperiment.mockResolvedValue(undefined);
    endExperiment.mockResolvedValue(undefined);

    const request = makeRequest("GET", {
      "Cron-Secret": "test-secret",
      Origin: "cron.process.ab-insightful.internal",
    });

    const response = await loader({ request });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    const body = await readJson(response);

    // production code stringifies arrays via template literal: `${started_experiments}`
    // which becomes "[object Object],[object Object]"
    expect(body).toEqual({
      ok: true,
      started_experiments: "[object Object],[object Object]",
      ended_experiments: "[object Object]",
      failures: [],
    });

    expect(startExperiment).toHaveBeenCalledTimes(2);
    expect(startExperiment).toHaveBeenNthCalledWith(1, 101);
    expect(startExperiment).toHaveBeenNthCalledWith(2, 102);

    expect(endExperiment).toHaveBeenCalledTimes(1);
    expect(endExperiment).toHaveBeenCalledWith(201);
  });

  test("GET: development mode logs received request and uses env.ORIGIN for origin check", async () => {
    process.env.NODE_ENV = "development";
    process.env.ORIGIN = "http://dev-origin.example";
    process.env.CRON_SECRET = "secret";

    const loader = await importLoaderWithMocks();

    getCandidatesForScheduledEnd.mockResolvedValue([]);
    getCandidatesForScheduledStart.mockResolvedValue([]);

    const request = makeRequest("GET", {
      "Cron-Secret": "secret",
      Origin: "https://ignored-in-dev.example",
    });

    const response = await loader({ request });

    expect(response.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(
      "[api/cron/poll-experiments] received request: ",
      request,
    );
  });

  test("non-OPTIONS/GET: returns 405", async () => {
    const loader = await importLoaderWithMocks();

    const request = makeRequest("POST", {
      "Cron-Secret": "test-secret",
      Origin: "cron.process.ab-insightful.internal",
    });

    const response = await loader({ request });

    expect(response.status).toBe(405);
    expect(await response.text()).toBe("");
  });

  //covers new SMS branch (happy branch) 
  test("GET: sends SMS start notification when experiment start + sms notifications are enabled", async () => {
    vi.resetModules();

    const getCandidatesForScheduledEnd = vi.fn().mockResolvedValue([]);
    const getCandidatesForScheduledStart = vi.fn().mockResolvedValue([
      { id: 101, name: "Exp A", projectId: 55 },
    ]);
    const endExperiment = vi.fn();
    const startExperiment = vi.fn().mockResolvedValue(undefined);

    const sendEmailStart = vi.fn();
    const sendSMSStart = vi.fn();
    const sendEmailEnd = vi.fn();
    const sendSMSEnd = vi.fn();

    mockProjectFindUnique.mockResolvedValue({
      enableExperimentStart: true,
      emailNotifEnabled: false,
      smsNotifEnabled: true,
      shop: "test.myshopify.com",
    });

    vi.doMock("../services/experiment.server", () => ({
      getCandidatesForScheduledEnd,
      getCandidatesForScheduledStart,
      endExperiment,
      startExperiment,
    }));

    vi.doMock("../db.server", () => ({
      default: {
        project: { findUnique: mockProjectFindUnique },
      },
    }));

    vi.doMock("../services/notifications.server", () => ({
      sendEmailStart,
      sendSMSStart,
      sendEmailEnd,
      sendSMSEnd,
    }));

    const { loader } = await import("../routes/api.cron.poll-experiments.jsx");

    const response = await loader({
      request: makeRequest("GET", { "Cron-Secret": "test-secret" }),
    });

    expect(response.status).toBe(200);
    expect(startExperiment).toHaveBeenCalledWith(101);
    expect(sendSMSStart).toHaveBeenCalledTimes(1);
    expect(sendSMSStart).toHaveBeenCalledWith(101, "Exp A", "test.myshopify.com");
    expect(sendEmailStart).not.toHaveBeenCalled();

  });

  test("GET: records failure when sendSMSStart throws", async () => {
    vi.resetModules();

    const getCandidatesForScheduledEnd = vi.fn().mockResolvedValue([]);
    const getCandidatesForScheduledStart = vi.fn().mockResolvedValue([
      { id: 101, name: "Exp A", projectId: 55 },
    ]);
    const endExperiment = vi.fn();
    const startExperiment = vi.fn().mockResolvedValue(undefined);

    const sendEmailStart = vi.fn();
    const sendSMSStart = vi.fn().mockRejectedValue(new Error("sms failed"));
    const sendEmailEnd = vi.fn();
    const sendSMSEnd = vi.fn();

    mockProjectFindUnique.mockResolvedValue({
      enableExperimentStart: true,
      emailNotifEnabled: false,
      smsNotifEnabled: true,
      shop: "test.myshopify.com",
    });

    vi.doMock("../services/experiment.server", () => ({
      getCandidatesForScheduledEnd,
      getCandidatesForScheduledStart,
      endExperiment,
      startExperiment,
    }));

    vi.doMock("../db.server", () => ({
      default: {
        project: { findUnique: mockProjectFindUnique },
      },
    }));

    vi.doMock("../services/notifications.server", () => ({
      sendEmailStart,
      sendSMSStart,
      sendEmailEnd,
      sendSMSEnd,
    }));

    const { loader } = await import("../routes/api.cron.poll-experiments.jsx");

    const response = await loader({
      request: makeRequest("GET", { "Cron-Secret": "test-secret" }),
    });

    const body = await readJson(response);

    expect(body.failures).toContain("sms failed");
  });

  test("GET: records failure when sendSMSStart throws", async () => {
    vi.resetModules();

    const getCandidatesForScheduledEnd = vi.fn().mockResolvedValue([]);
    const getCandidatesForScheduledStart = vi.fn().mockResolvedValue([
      { id: 101, name: "Exp A", projectId: 55 },
    ]);
    const endExperiment = vi.fn();
    const startExperiment = vi.fn().mockResolvedValue(undefined);

    const sendEmailStart = vi.fn();
    const sendSMSStart = vi.fn().mockRejectedValue(new Error("sms failed"));
    const sendEmailEnd = vi.fn();
    const sendSMSEnd = vi.fn();

    mockProjectFindUnique.mockResolvedValue({
      enableExperimentStart: true,
      emailNotifEnabled: false,
      smsNotifEnabled: true,
      shop: "test.myshopify.com",
    });

    vi.doMock("../services/experiment.server", () => ({
      getCandidatesForScheduledEnd,
      getCandidatesForScheduledStart,
      endExperiment,
      startExperiment,
    }));

    vi.doMock("../db.server", () => ({
      default: {
        project: { findUnique: mockProjectFindUnique },
      },
    }));

    vi.doMock("../services/notifications.server", () => ({
      sendEmailStart,
      sendSMSStart,
      sendEmailEnd,
      sendSMSEnd,
    }));

    const { loader } = await import("../routes/api.cron.poll-experiments.jsx");

    const response = await loader({
      request: makeRequest("GET", { "Cron-Secret": "test-secret" }),
    });

    const body = await readJson(response);

    expect(body.failures).toContain("sms failed");
  });

});
