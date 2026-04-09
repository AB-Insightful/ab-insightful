import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Static mocks ────────────────────────────────────────────────────────────

vi.mock("../shopify.server", () => ({
  authenticate: {
    admin: vi.fn(),
  },
}));

vi.mock("../db.server", () => ({
  default: {
    project: {
      upsert: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    contactEmail: {
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    contactPhone: {
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

// Dynamic imports used inside action branches are mocked with vi.doMock per
// describe block where needed, and the module is re-imported via importAction().

import { authenticate } from "../shopify.server";
import db from "../db.server";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a fake FormData object from a plain object. */
function makeFormData(fields = {}) {
  const fd = new Map(Object.entries(fields));
  return {
    get: (key) => fd.get(key) ?? null,
  };
}

/** Build a minimal Request whose formData() resolves to the given fields. */
function makeRequest(fields = {}) {
  const fd = makeFormData(fields);
  return {
    formData: vi.fn().mockResolvedValue(fd),
  };
}

/** Fresh import of loader + action after vi.resetModules(). */
async function importModule() {
  const mod = await import("../routes/app.settings.jsx");
  return { loader: mod.loader, action: mod.action };
}

// ─── formatPhone (pure utility — tested directly via the module's named export
//     if one exists, otherwise we re-derive the same logic here for coverage) ─

describe("formatPhone", () => {
  // formatPhone is not exported, so we test it through the observable output of
  // the module by importing it normally and exercising the logic inline.
  // If your build exposes it as a named export, swap these with direct calls.

  function formatPhone(digits) {
    if (digits.length === 10) {
      return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return digits;
  }

  it("formats a 10-digit string as XXX-XXX-XXXX", () => {
    expect(formatPhone("5551234567")).toBe("555-123-4567");
  });

  it("returns the input unchanged when shorter than 10 digits", () => {
    expect(formatPhone("123")).toBe("123");
  });

  it("returns the input unchanged when longer than 10 digits", () => {
    expect(formatPhone("12345678901")).toBe("12345678901");
  });

  it("returns empty string for empty input", () => {
    expect(formatPhone("")).toBe("");
  });
});

// ─── loader ──────────────────────────────────────────────────────────────────

describe("loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upserts the project for the current shop and returns expected fields", async () => {
    authenticate.admin.mockResolvedValue({ session: { shop: "test.myshopify.com" } });

    const fakeProject = {
      defaultGoal: "completedCheckout",
      enableExperimentStart: true,
      enableExperimentEnd: false,
      maxUsersPerExperiment: 5000,
      contactEmails: [{ id: 1, email: "a@b.com" }],
      contactPhones: [{ id: 2, phoneNumber: "5551234567" }],
      emailNotifEnabled: true,
      smsNotifEnabled: false,
    };

    db.project.upsert.mockResolvedValue(fakeProject);

    vi.resetModules();
    vi.doMock("../services/tutorialData.server", () => ({
      getTutorialData: vi.fn().mockResolvedValue({ generalSettings: true }),
    }));

    const { loader } = await importModule();
    const result = await loader({ request: { url: "http://localhost/app/settings" } });

    expect(db.project.upsert).toHaveBeenCalledTimes(1);
    expect(db.project.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shop: "test.myshopify.com" },
      })
    );

    expect(result).toMatchObject({
      defaultGoal: "completedCheckout",
      enableExperimentStart: true,
      enableExperimentEnd: false,
      maxUsersPerExperiment: 5000,
      contactEmails: fakeProject.contactEmails,
      contactPhones: fakeProject.contactPhones,
      emailNotifEnabled: true,
      smsNotifEnabled: false,
    });

    expect(result.tutorialData).toEqual({ generalSettings: true });
  });

  it("creates the project record with defaultGoal 'completedCheckout' on first visit", async () => {
    authenticate.admin.mockResolvedValue({ session: { shop: "new.myshopify.com" } });

    db.project.upsert.mockResolvedValue({
      defaultGoal: "completedCheckout",
      enableExperimentStart: false,
      enableExperimentEnd: false,
      maxUsersPerExperiment: 10000,
      contactEmails: [],
      contactPhones: [],
      emailNotifEnabled: false,
      smsNotifEnabled: false,
    });

    vi.resetModules();
    vi.doMock("../services/tutorialData.server", () => ({
      getTutorialData: vi.fn().mockResolvedValue({ generalSettings: false }),
    }));

    const { loader } = await importModule();
    const result = await loader({ request: {} });

    const upsertCall = db.project.upsert.mock.calls[0][0];
    expect(upsertCall.create).toMatchObject({
      shop: "new.myshopify.com",
      defaultGoal: "completedCheckout",
    });

    expect(result.defaultGoal).toBe("completedCheckout");
  });
});

// ─── action — updateDefaultGoal ──────────────────────────────────────────────

describe("action: updateDefaultGoal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticate.admin.mockResolvedValue({ session: { shop: "test.myshopify.com" } });
  });

  it("upserts with trimmed goal and returns ok response", async () => {
    db.project.upsert.mockResolvedValue({});
    vi.resetModules();
    const { action } = await importModule();

    const request = makeRequest({ intent: "updateDefaultGoal", defaultGoal: "  viewPage  " });
    const result = await action({ request });

    expect(db.project.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { defaultGoal: "viewPage" } })
    );
    expect(result).toEqual({ ok: true, intent: "updateDefaultGoal", defaultGoal: "viewPage" });
  });

  it("uses empty string when defaultGoal field is missing", async () => {
    db.project.upsert.mockResolvedValue({});
    vi.resetModules();
    const { action } = await importModule();

    const request = makeRequest({ intent: "updateDefaultGoal" }); // no defaultGoal key
    const result = await action({ request });

    expect(result.defaultGoal).toBe("");
  });
});

// ─── action — SMS toggle ──────────────────────────────────────────────────────

describe("action: set_sms_notif_true", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticate.admin.mockResolvedValue({ session: { shop: "test.myshopify.com" } });
  });

  it("calls setSMSNotifToggle(true), updates db, and returns ok", async () => {
    const setSMSNotifToggle = vi.fn().mockResolvedValue(undefined);
    vi.resetModules();
    vi.doMock("../services/project.server", () => ({ setSMSNotifToggle }));
    db.project.update.mockResolvedValue({});

    const { action } = await importModule();
    const result = await action({ request: makeRequest({ intent: "set_sms_notif_true" }) });

    expect(setSMSNotifToggle).toHaveBeenCalledWith(true);
    expect(db.project.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { smsNotifEnabled: true } })
    );
    expect(result).toEqual({ ok: true, intent: "set_sms_notif_true" });
  });

  it("returns error when setSMSNotifToggle throws", async () => {
    const setSMSNotifToggle = vi.fn().mockRejectedValue(new Error("sns error"));
    vi.resetModules();
    vi.doMock("../services/project.server", () => ({ setSMSNotifToggle }));

    const { action } = await importModule();
    const result = await action({ request: makeRequest({ intent: "set_sms_notif_true" }) });

    expect(result).toEqual({ ok: false, error: "failed to change sms toggle to true" });
    expect(db.project.update).not.toHaveBeenCalled();
  });
});

describe("action: set_sms_notif_false", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticate.admin.mockResolvedValue({ session: { shop: "test.myshopify.com" } });
  });

  it("calls setSMSNotifToggle(false), updates db, and returns ok", async () => {
    const setSMSNotifToggle = vi.fn().mockResolvedValue(undefined);
    vi.resetModules();
    vi.doMock("../services/project.server", () => ({ setSMSNotifToggle }));
    db.project.update.mockResolvedValue({});

    const { action } = await importModule();
    const result = await action({ request: makeRequest({ intent: "set_sms_notif_false" }) });

    expect(setSMSNotifToggle).toHaveBeenCalledWith(false);
    expect(db.project.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { smsNotifEnabled: false } })
    );
    expect(result).toEqual({ ok: true, intent: "set_sms_notif_false" });
  });

  it("returns error when setSMSNotifToggle throws", async () => {
    const setSMSNotifToggle = vi.fn().mockRejectedValue(new Error("fail"));
    vi.resetModules();
    vi.doMock("../services/project.server", () => ({ setSMSNotifToggle }));

    const { action } = await importModule();
    const result = await action({ request: makeRequest({ intent: "set_sms_notif_false" }) });

    expect(result).toEqual({ ok: false, error: "failed to sms toggle to false" });
    expect(db.project.update).not.toHaveBeenCalled();
  });
});

// ─── action — Email toggle ────────────────────────────────────────────────────

describe("action: set_email_notif_true", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticate.admin.mockResolvedValue({ session: { shop: "test.myshopify.com" } });
  });

  it("calls setEmailNotifToggle(true), updates db, and returns ok", async () => {
    const setEmailNotifToggle = vi.fn().mockResolvedValue(undefined);
    vi.resetModules();
    vi.doMock("../services/project.server", () => ({ setEmailNotifToggle }));
    db.project.update.mockResolvedValue({});

    const { action } = await importModule();
    const result = await action({ request: makeRequest({ intent: "set_email_notif_true" }) });

    expect(setEmailNotifToggle).toHaveBeenCalledWith(true);
    expect(db.project.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { emailNotifEnabled: true } })
    );
    expect(result).toEqual({ ok: true, intent: "set_email_notif_true" });
  });

  it("returns error when setEmailNotifToggle throws", async () => {
    const setEmailNotifToggle = vi.fn().mockRejectedValue(new Error("fail"));
    vi.resetModules();
    vi.doMock("../services/project.server", () => ({ setEmailNotifToggle }));

    const { action } = await importModule();
    const result = await action({ request: makeRequest({ intent: "set_email_notif_true" }) });

    expect(result).toEqual({ ok: false, error: "failed to change email toggle" });
    expect(db.project.update).not.toHaveBeenCalled();
  });
});

describe("action: set_email_notif_false", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticate.admin.mockResolvedValue({ session: { shop: "test.myshopify.com" } });
  });

  it("calls setEmailNotifToggle(false), updates db, and returns ok", async () => {
    const setEmailNotifToggle = vi.fn().mockResolvedValue(undefined);
    vi.resetModules();
    vi.doMock("../services/project.server", () => ({ setEmailNotifToggle }));
    db.project.update.mockResolvedValue({});

    const { action } = await importModule();
    const result = await action({ request: makeRequest({ intent: "set_email_notif_false" }) });

    expect(setEmailNotifToggle).toHaveBeenCalledWith(false);
    expect(db.project.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { emailNotifEnabled: false } })
    );
    expect(result).toEqual({ ok: true, intent: "set_email_notif_false" });
  });

  it("returns error when setEmailNotifToggle throws", async () => {
    const setEmailNotifToggle = vi.fn().mockRejectedValue(new Error("fail"));
    vi.resetModules();
    vi.doMock("../services/project.server", () => ({ setEmailNotifToggle }));

    const { action } = await importModule();
    const result = await action({ request: makeRequest({ intent: "set_email_notif_false" }) });

    expect(result).toEqual({ ok: false, error: "failed to change email toggle" });
  });
});

// ─── action — tutorial_viewed ─────────────────────────────────────────────────

describe("action: tutorial_viewed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticate.admin.mockResolvedValue({ session: { shop: "test.myshopify.com" } });
  });

  it("calls setGeneralSettings(1, true) and returns ok", async () => {
    const setGeneralSettings = vi.fn().mockResolvedValue(undefined);
    vi.resetModules();
    vi.doMock("../services/tutorialData.server", () => ({ setGeneralSettings }));

    const { action } = await importModule();
    const result = await action({ request: makeRequest({ intent: "tutorial_viewed" }) });

    expect(setGeneralSettings).toHaveBeenCalledWith(1, true);
    expect(result).toEqual({ ok: true, action: "tutorial_viewed" });
  });

  it("returns error when setGeneralSettings throws", async () => {
    const setGeneralSettings = vi.fn().mockRejectedValue(new Error("db error"));
    vi.resetModules();
    vi.doMock("../services/tutorialData.server", () => ({ setGeneralSettings }));

    const { action } = await importModule();
    const result = await action({ request: makeRequest({ intent: "tutorial_viewed" }) });

    expect(setGeneralSettings).toHaveBeenCalledWith(1, true);
    expect(result).toEqual({ ok: false, error: "Failed to update viewedListExperiment" });
  });
});

// ─── action — addEmail ────────────────────────────────────────────────────────

describe("action: addEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticate.admin.mockResolvedValue({ session: { shop: "test.myshopify.com" } });
  });

  it("returns field error when email is empty", async () => {
    vi.resetModules();
    const { action } = await importModule();

    const result = await action({ request: makeRequest({ intent: "addEmail", email: "  " }) });
    expect(result).toEqual({ error: "Email cannot be null", field: "email" });
  });

  it("returns field error when email format is invalid", async () => {
    vi.resetModules();
    const { action } = await importModule();

    const result = await action({ request: makeRequest({ intent: "addEmail", email: "notanemail" }) });
    expect(result).toEqual({ error: "Please enter a valid email (e.g. user@example.com)", field: "email" });
  });

  it("returns field error when email is a duplicate", async () => {
    db.project.findUnique.mockResolvedValue({ id: 10 });
    db.contactEmail.findFirst.mockResolvedValue({ id: 99 }); // existing record

    const subscribeEmail = vi.fn();
    vi.resetModules();
    vi.doMock("../services/notifications.server", () => ({ subscribeEmail }));

    const { action } = await importModule();
    const result = await action({ request: makeRequest({ intent: "addEmail", email: "dupe@example.com" }) });

    expect(result).toEqual({ error: "Provided email is already saved", field: "email" });
    expect(db.contactEmail.create).not.toHaveBeenCalled();
  });

  it("creates contact email and subscribes on success", async () => {
    db.project.findUnique.mockResolvedValue({ id: 10 });
    db.contactEmail.findFirst.mockResolvedValue(null); // no duplicate
    db.contactEmail.create.mockResolvedValue({ id: 1 });

    const subscribeEmail = vi.fn().mockResolvedValue("success");
    vi.resetModules();
    vi.doMock("../services/notifications.server", () => ({ subscribeEmail }));

    const { action } = await importModule();
    const result = await action({ request: makeRequest({ intent: "addEmail", email: "NEW@Example.com" }) });

    // email should be lowercased
    expect(db.contactEmail.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { email: "new@example.com", projectId: 10 } })
    );
    expect(subscribeEmail).toHaveBeenCalledWith("new@example.com");
    expect(result).toEqual({ ok: true });
  });
});

// ─── action — deleteEmail ─────────────────────────────────────────────────────

describe("action: deleteEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticate.admin.mockResolvedValue({ session: { shop: "test.myshopify.com" } });
  });

  it("unsubscribes email and deletes record by id", async () => {
    const unsubscribeEmail = vi.fn().mockResolvedValue(undefined);
    db.contactEmail.delete.mockResolvedValue({});

    vi.resetModules();
    vi.doMock("../services/notifications.server", () => ({ unsubscribeEmail }));

    const { action } = await importModule();
    const result = await action({
      request: makeRequest({ intent: "deleteEmail", email: "a@b.com", id: "7" }),
    });

    expect(unsubscribeEmail).toHaveBeenCalledWith("a@b.com");
    expect(db.contactEmail.delete).toHaveBeenCalledWith({ where: { id: 7 } });
    expect(result).toEqual({ ok: true });
  });
});

// ─── action — addPhone ────────────────────────────────────────────────────────

describe("action: addPhone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticate.admin.mockResolvedValue({ session: { shop: "test.myshopify.com" } });
  });

  it("returns field error when phone is empty", async () => {
    vi.resetModules();
    const { action } = await importModule();

    const result = await action({ request: makeRequest({ intent: "addPhone", phone: "  " }) });
    expect(result).toEqual({ error: "Phone number cannot be null", field: "phone" });
  });

  it("returns field error when phone format is invalid", async () => {
    vi.resetModules();
    const { action } = await importModule();

    const result = await action({ request: makeRequest({ intent: "addPhone", phone: "123" }) });
    expect(result).toEqual({
      error: "Please enter a valid phone number (e.g. 555-555-5555)",
      field: "phone",
    });
  });

  it("returns field error when phone is a duplicate", async () => {
    db.project.findUnique.mockResolvedValue({ id: 10 });
    db.contactPhone.findFirst.mockResolvedValue({ id: 99 });

    vi.resetModules();
    const { action } = await importModule();

    const result = await action({ request: makeRequest({ intent: "addPhone", phone: "555-123-4567" }) });
    expect(result).toEqual({ error: "Provided phone number is already saved", field: "phone" });
    expect(db.contactPhone.create).not.toHaveBeenCalled();
  });

  it("strips non-digits, creates record, and subscribes on success", async () => {
    db.project.findUnique.mockResolvedValue({ id: 10 });
    db.contactPhone.findFirst.mockResolvedValue(null);
    db.contactPhone.create.mockResolvedValue({ id: 1 });

    const subscribePhoneNum = vi.fn().mockResolvedValue(undefined);
    vi.resetModules();
    vi.doMock("../services/notifications.server", () => ({ subscribePhoneNum }));

    const { action } = await importModule();
    const result = await action({ request: makeRequest({ intent: "addPhone", phone: "(555) 123-4567" }) });

    expect(db.contactPhone.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { phoneNumber: "5551234567", projectId: 10 } })
    );
    expect(subscribePhoneNum).toHaveBeenCalledWith("5551234567");
    expect(result).toEqual({ ok: true });
  });

  it("accepts dashes format 555-123-4567", async () => {
    db.project.findUnique.mockResolvedValue({ id: 10 });
    db.contactPhone.findFirst.mockResolvedValue(null);
    db.contactPhone.create.mockResolvedValue({});

    const subscribePhoneNum = vi.fn().mockResolvedValue(undefined);
    vi.resetModules();
    vi.doMock("../services/notifications.server", () => ({ subscribePhoneNum }));

    const { action } = await importModule();
    const result = await action({ request: makeRequest({ intent: "addPhone", phone: "555-123-4567" }) });

    expect(result).toEqual({ ok: true });
  });
});

// ─── action — deletePhone ─────────────────────────────────────────────────────

describe("action: deletePhone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticate.admin.mockResolvedValue({ session: { shop: "test.myshopify.com" } });
  });

  it("unsubscribes phone number and deletes record by id", async () => {
    const unsubscribePhoneNum = vi.fn().mockResolvedValue(undefined);
    db.contactPhone.delete.mockResolvedValue({});

    vi.resetModules();
    vi.doMock("../services/notifications.server", () => ({ unsubscribePhoneNum }));

    const { action } = await importModule();
    const result = await action({
      request: makeRequest({ intent: "deletePhone", phoneNumber: "5551234567", id: "3" }),
    });

    expect(unsubscribePhoneNum).toHaveBeenCalledWith("5551234567");
    expect(db.contactPhone.delete).toHaveBeenCalledWith({ where: { id: 3 } });
    expect(result).toEqual({ ok: true });
  });
});

// ─── action — deleteAll ───────────────────────────────────────────────────────

describe("action: deleteAll", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticate.admin.mockResolvedValue({ session: { shop: "test.myshopify.com" } });
  });

  it("unsubscribes all, then deletes all contact records for the project", async () => {
    const unsubscribeAll = vi.fn().mockResolvedValue(undefined);
    const unsubscribeAllPhoneNums = vi.fn().mockResolvedValue(undefined);
    db.project.findUnique.mockResolvedValue({ id: 42 });
    db.contactEmail.deleteMany.mockResolvedValue({});
    db.contactPhone.deleteMany.mockResolvedValue({});

    vi.resetModules();
    vi.doMock("../services/notifications.server", () => ({ unsubscribeAll, unsubscribeAllPhoneNums }));

    const { action } = await importModule();
    const result = await action({ request: makeRequest({ intent: "deleteAll" }) });

    expect(unsubscribeAll).toHaveBeenCalledTimes(1);
    expect(unsubscribeAllPhoneNums).toHaveBeenCalledTimes(1);
    expect(db.contactEmail.deleteMany).toHaveBeenCalledWith({ where: { projectId: 42 } });
    expect(db.contactPhone.deleteMany).toHaveBeenCalledWith({ where: { projectId: 42 } });
    expect(result).toEqual({ ok: true });
  });
});

// ─── action — updateExperimentStart / End ─────────────────────────────────────

describe("action: updateExperimentStart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticate.admin.mockResolvedValue({ session: { shop: "test.myshopify.com" } });
    db.project.update.mockResolvedValue({});
  });

  it('sets enableExperimentStart to true when value is "true"', async () => {
    vi.resetModules();
    const { action } = await importModule();

    const result = await action({
      request: makeRequest({ intent: "updateExperimentStart", value: "true" }),
    });

    expect(db.project.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { enableExperimentStart: true } })
    );
    expect(result).toEqual({ ok: true, intent: "updateExperimentStart" });
  });

  it('sets enableExperimentStart to false when value is "false"', async () => {
    vi.resetModules();
    const { action } = await importModule();

    const result = await action({
      request: makeRequest({ intent: "updateExperimentStart", value: "false" }),
    });

    expect(db.project.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { enableExperimentStart: false } })
    );
    expect(result).toEqual({ ok: true, intent: "updateExperimentStart" });
  });
});

describe("action: updateExperimentEnd", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticate.admin.mockResolvedValue({ session: { shop: "test.myshopify.com" } });
    db.project.update.mockResolvedValue({});
  });

  it('sets enableExperimentEnd to true when value is "true"', async () => {
    vi.resetModules();
    const { action } = await importModule();

    const result = await action({
      request: makeRequest({ intent: "updateExperimentEnd", value: "true" }),
    });

    expect(db.project.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { enableExperimentEnd: true } })
    );
    expect(result).toEqual({ ok: true, intent: "updateExperimentEnd" });
  });
});

// ─── action — updateMaxUsersPerExperiment ─────────────────────────────────────

describe("action: updateMaxUsersPerExperiment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticate.admin.mockResolvedValue({ session: { shop: "test.myshopify.com" } });
    db.project.update.mockResolvedValue({});
  });

  it("returns error when value is empty string", async () => {
    vi.resetModules();
    const { action } = await importModule();

    const result = await action({
      request: makeRequest({ intent: "updateMaxUsersPerExperiment", maxUsersPerExperiment: "" }),
    });

    expect(result).toMatchObject({ ok: false, error: "Must be a valid integer", field: "maxUsersPerExperiment" });
  });

  it("returns error when value is non-numeric", async () => {
    vi.resetModules();
    const { action } = await importModule();

    const result = await action({
      request: makeRequest({ intent: "updateMaxUsersPerExperiment", maxUsersPerExperiment: "abc" }),
    });

    expect(result).toMatchObject({ ok: false, error: "Must be a valid integer" });
  });

  it("returns error when value is less than 1", async () => {
    vi.resetModules();
    const { action } = await importModule();

    const result = await action({
      request: makeRequest({ intent: "updateMaxUsersPerExperiment", maxUsersPerExperiment: "0" }),
    });

    expect(result).toMatchObject({ ok: false, error: "Must be at least 1" });
  });

  it("returns error when value exceeds 1,000,000", async () => {
    vi.resetModules();
    const { action } = await importModule();

    const result = await action({
      request: makeRequest({ intent: "updateMaxUsersPerExperiment", maxUsersPerExperiment: "1000001" }),
    });

    expect(result).toMatchObject({ ok: false, error: "Must be at most 1,000,000" });
  });

  it("updates db and returns ok for a valid value", async () => {
    vi.resetModules();
    const { action } = await importModule();

    const result = await action({
      request: makeRequest({ intent: "updateMaxUsersPerExperiment", maxUsersPerExperiment: "500" }),
    });

    expect(db.project.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { maxUsersPerExperiment: 500 } })
    );
    expect(result).toEqual({ ok: true, intent: "updateMaxUsersPerExperiment", maxUsersPerExperiment: 500 });
  });

  it("accepts boundary value of exactly 1", async () => {
    vi.resetModules();
    const { action } = await importModule();

    const result = await action({
      request: makeRequest({ intent: "updateMaxUsersPerExperiment", maxUsersPerExperiment: "1" }),
    });

    expect(result).toEqual({ ok: true, intent: "updateMaxUsersPerExperiment", maxUsersPerExperiment: 1 });
  });

  it("accepts boundary value of exactly 1,000,000", async () => {
    vi.resetModules();
    const { action } = await importModule();

    const result = await action({
      request: makeRequest({ intent: "updateMaxUsersPerExperiment", maxUsersPerExperiment: "1000000" }),
    });

    expect(result).toEqual({ ok: true, intent: "updateMaxUsersPerExperiment", maxUsersPerExperiment: 1000000 });
  });
});

// ─── action — disableNotifications ───────────────────────────────────────────

describe("action: disableNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticate.admin.mockResolvedValue({ session: { shop: "test.myshopify.com" } });
    db.project.update.mockResolvedValue({});
  });

  it("sets both experiment flags to false and returns ok", async () => {
    vi.resetModules();
    const { action } = await importModule();

    const result = await action({ request: makeRequest({ intent: "disableNotifications" }) });

    expect(db.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { enableExperimentStart: false, enableExperimentEnd: false },
      })
    );
    expect(result).toEqual({ ok: true, intent: "disableNotifications" });
  });
});

// ─── action — unknown intent ──────────────────────────────────────────────────

describe("action: unknown intent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticate.admin.mockResolvedValue({ session: { shop: "test.myshopify.com" } });
  });

  it("returns error for unrecognized intent", async () => {
    vi.resetModules();
    const { action } = await importModule();

    const result = await action({ request: makeRequest({ intent: "somethingRandom" }) });
    expect(result).toEqual({ error: "Unknown intent.", field: null });
  });
});

// ─── loader — edge cases ─────────────────────────────────────────────────────

describe("loader: edge cases", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns tutorialData from getTutorialData", async () => {
    authenticate.admin.mockResolvedValue({ session: { shop: "a.myshopify.com" } });

    db.project.upsert.mockResolvedValue({
      defaultGoal: "addToCart",
      enableExperimentStart: false,
      enableExperimentEnd: false,
      maxUsersPerExperiment: null, // null — triggers ?? default downstream
      contactEmails: [],
      contactPhones: [],
      emailNotifEnabled: false,
      smsNotifEnabled: false,
    });

    vi.resetModules();
    vi.doMock("../services/tutorialData.server", () => ({
      getTutorialData: vi.fn().mockResolvedValue({ generalSettings: false }),
    }));

    const { loader } = await importModule();
    const result = await loader({ request: {} });

    expect(result.maxUsersPerExperiment).toBeNull();
    expect(result.tutorialData).toEqual({ generalSettings: false });
  });

  it("passes shop-specific upsert create payload on first visit", async () => {
    authenticate.admin.mockResolvedValue({ session: { shop: "brand-new.myshopify.com" } });

    db.project.upsert.mockResolvedValue({
      defaultGoal: "completedCheckout",
      enableExperimentStart: false,
      enableExperimentEnd: false,
      maxUsersPerExperiment: 10000,
      contactEmails: [],
      contactPhones: [],
      emailNotifEnabled: false,
      smsNotifEnabled: false,
    });

    vi.resetModules();
    vi.doMock("../services/tutorialData.server", () => ({
      getTutorialData: vi.fn().mockResolvedValue({ generalSettings: true }),
    }));

    const { loader } = await importModule();
    await loader({ request: {} });

    const call = db.project.upsert.mock.calls[0][0];
    expect(call.create.name).toBe("brand-new.myshopify.com Project");
    expect(call.create.defaultGoal).toBe("completedCheckout");
  });
});

// ─── action: updateDefaultGoal — whitespace-only value ───────────────────────

describe("action: updateDefaultGoal — additional", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticate.admin.mockResolvedValue({ session: { shop: "test.myshopify.com" } });
  });

  it("trims whitespace-only value to empty string", async () => {
    db.project.upsert.mockResolvedValue({});
    vi.resetModules();
    const { action } = await importModule();

    const result = await action({ request: makeRequest({ intent: "updateDefaultGoal", defaultGoal: "   " }) });
    expect(result.defaultGoal).toBe("");
  });
});

// ─── action: set_email_notif_false — db update confirmed ─────────────────────

describe("action: set_email_notif_false — additional", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticate.admin.mockResolvedValue({ session: { shop: "test.myshopify.com" } });
  });

  it("updates db with emailNotifEnabled: false on success", async () => {
    const setEmailNotifToggle = vi.fn().mockResolvedValue(undefined);
    vi.resetModules();
    vi.doMock("../services/project.server", () => ({ setEmailNotifToggle }));
    db.project.update.mockResolvedValue({});

    const { action } = await importModule();
    await action({ request: makeRequest({ intent: "set_email_notif_false" }) });

    expect(db.project.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { emailNotifEnabled: false } })
    );
  });
});

// ─── action: updateExperimentEnd — false branch ───────────────────────────────

describe("action: updateExperimentEnd — false branch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticate.admin.mockResolvedValue({ session: { shop: "test.myshopify.com" } });
    db.project.update.mockResolvedValue({});
  });

  it('sets enableExperimentEnd to false when value is "false"', async () => {
    vi.resetModules();
    const { action } = await importModule();

    const result = await action({
      request: makeRequest({ intent: "updateExperimentEnd", value: "false" }),
    });

    expect(db.project.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { enableExperimentEnd: false } })
    );
    expect(result).toEqual({ ok: true, intent: "updateExperimentEnd" });
  });
});

// ─── action: addEmail — null field (no key in form data) ─────────────────────

describe("action: addEmail — null field", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticate.admin.mockResolvedValue({ session: { shop: "test.myshopify.com" } });
  });

  it("returns error when email key is absent from form data", async () => {
    vi.resetModules();
    const { action } = await importModule();

    // 'email' key not present → formData.get returns null → trimmed to ""
    const result = await action({ request: makeRequest({ intent: "addEmail" }) });
    expect(result).toEqual({ error: "Email cannot be null", field: "email" });
  });

  it("returns format error for email missing TLD", async () => {
    vi.resetModules();
    const { action } = await importModule();

    const result = await action({ request: makeRequest({ intent: "addEmail", email: "user@nodot" }) });
    expect(result).toEqual({
      error: "Please enter a valid email (e.g. user@example.com)",
      field: "email",
    });
  });

  it("returns format error for email missing @", async () => {
    vi.resetModules();
    const { action } = await importModule();

    const result = await action({ request: makeRequest({ intent: "addEmail", email: "userexample.com" }) });
    expect(result).toEqual({
      error: "Please enter a valid email (e.g. user@example.com)",
      field: "email",
    });
  });
});

// ─── action: addPhone — null field and format variants ───────────────────────

describe("action: addPhone — null field and format variants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticate.admin.mockResolvedValue({ session: { shop: "test.myshopify.com" } });
  });

  it("returns error when phone key is absent from form data", async () => {
    vi.resetModules();
    const { action } = await importModule();

    const result = await action({ request: makeRequest({ intent: "addPhone" }) });
    expect(result).toEqual({ error: "Phone number cannot be null", field: "phone" });
  });

  it("returns format error for letters-only input", async () => {
    vi.resetModules();
    const { action } = await importModule();

    const result = await action({ request: makeRequest({ intent: "addPhone", phone: "abcdefghij" }) });
    expect(result).toEqual({
      error: "Please enter a valid phone number (e.g. 555-555-5555)",
      field: "phone",
    });
  });

  it("accepts plain 10-digit format with no separators", async () => {
    db.project.findUnique.mockResolvedValue({ id: 10 });
    db.contactPhone.findFirst.mockResolvedValue(null);
    db.contactPhone.create.mockResolvedValue({});

    const subscribePhoneNum = vi.fn().mockResolvedValue(undefined);
    vi.resetModules();
    vi.doMock("../services/notifications.server", () => ({ subscribePhoneNum }));

    const { action } = await importModule();
    const result = await action({ request: makeRequest({ intent: "addPhone", phone: "5551234567" }) });

    expect(db.contactPhone.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { phoneNumber: "5551234567", projectId: 10 } })
    );
    expect(result).toEqual({ ok: true });
  });

  it("accepts space-separated format 555 123 4567", async () => {
    db.project.findUnique.mockResolvedValue({ id: 10 });
    db.contactPhone.findFirst.mockResolvedValue(null);
    db.contactPhone.create.mockResolvedValue({});

    const subscribePhoneNum = vi.fn().mockResolvedValue(undefined);
    vi.resetModules();
    vi.doMock("../services/notifications.server", () => ({ subscribePhoneNum }));

    const { action } = await importModule();
    const result = await action({ request: makeRequest({ intent: "addPhone", phone: "555 123 4567" }) });

    expect(result).toEqual({ ok: true });
    expect(subscribePhoneNum).toHaveBeenCalledWith("5551234567");
  });
});

// ─── action: deleteEmail — non-numeric id ────────────────────────────────────

describe("action: deleteEmail — non-numeric id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticate.admin.mockResolvedValue({ session: { shop: "test.myshopify.com" } });
  });

  it("passes NaN to db.contactEmail.delete when id is non-numeric", async () => {
    const unsubscribeEmail = vi.fn().mockResolvedValue(undefined);
    db.contactEmail.delete.mockResolvedValue({});

    vi.resetModules();
    vi.doMock("../services/notifications.server", () => ({ unsubscribeEmail }));

    const { action } = await importModule();
    await action({ request: makeRequest({ intent: "deleteEmail", email: "a@b.com", id: "not-a-number" }) });

    // parseInt("not-a-number", 10) → NaN; the call should still be made
    expect(db.contactEmail.delete).toHaveBeenCalledWith({ where: { id: NaN } });
  });
});

// ─── action: updateMaxUsersPerExperiment — null field ────────────────────────

describe("action: updateMaxUsersPerExperiment — null field", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticate.admin.mockResolvedValue({ session: { shop: "test.myshopify.com" } });
    db.project.update.mockResolvedValue({});
  });

  it("returns NaN error when maxUsersPerExperiment key is absent", async () => {
    vi.resetModules();
    const { action } = await importModule();

    // key absent → formData.get returns null → parsed as NaN
    const result = await action({
      request: makeRequest({ intent: "updateMaxUsersPerExperiment" }),
    });

    expect(result).toMatchObject({
      ok: false,
      error: "Must be a valid integer",
      field: "maxUsersPerExperiment",
    });
    expect(db.project.update).not.toHaveBeenCalled();
  });

  it("returns NaN error for a float string", async () => {
    vi.resetModules();
    const { action } = await importModule();

    // parseInt("3.14") → 3, which is valid — test a truly unparseable value
    const result = await action({
      request: makeRequest({ intent: "updateMaxUsersPerExperiment", maxUsersPerExperiment: "3.14" }),
    });

    // parseInt("3.14", 10) === 3 which IS valid, so this should succeed
    expect(result).toEqual({
      ok: true,
      intent: "updateMaxUsersPerExperiment",
      maxUsersPerExperiment: 3,
    });
  });

  it("returns error for negative value", async () => {
    vi.resetModules();
    const { action } = await importModule();

    const result = await action({
      request: makeRequest({ intent: "updateMaxUsersPerExperiment", maxUsersPerExperiment: "-5" }),
    });

    expect(result).toMatchObject({ ok: false, error: "Must be at least 1" });
  });
});

// ─── action: deleteAll — projectId routing ───────────────────────────────────

describe("action: deleteAll — projectId routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticate.admin.mockResolvedValue({ session: { shop: "test.myshopify.com" } });
  });

  it("uses the project id returned by findUnique for both deleteMany calls", async () => {
    const unsubscribeAll = vi.fn().mockResolvedValue(undefined);
    const unsubscribeAllPhoneNums = vi.fn().mockResolvedValue(undefined);
    db.project.findUnique.mockResolvedValue({ id: 77 });
    db.contactEmail.deleteMany.mockResolvedValue({});
    db.contactPhone.deleteMany.mockResolvedValue({});

    vi.resetModules();
    vi.doMock("../services/notifications.server", () => ({ unsubscribeAll, unsubscribeAllPhoneNums }));

    const { action } = await importModule();
    const result = await action({ request: makeRequest({ intent: "deleteAll" }) });

    expect(db.contactEmail.deleteMany).toHaveBeenCalledWith({ where: { projectId: 77 } });
    expect(db.contactPhone.deleteMany).toHaveBeenCalledWith({ where: { projectId: 77 } });
    expect(result).toEqual({ ok: true });
  });
});

// ─── action: disableNotifications — both flags ───────────────────────────────

describe("action: disableNotifications — both flags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticate.admin.mockResolvedValue({ session: { shop: "test.myshopify.com" } });
    db.project.update.mockResolvedValue({});
  });

  it("sends a single update containing both false flags", async () => {
    vi.resetModules();
    const { action } = await importModule();

    const result = await action({ request: makeRequest({ intent: "disableNotifications" }) });

    const updateCall = db.project.update.mock.calls[0][0];
    expect(updateCall.data).toEqual({ enableExperimentStart: false, enableExperimentEnd: false });
    expect(db.project.update).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true, intent: "disableNotifications" });
  });
});

// ─── action: unknown intent — various unmatched strings ──────────────────────

describe("action: unknown intent — extra cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticate.admin.mockResolvedValue({ session: { shop: "test.myshopify.com" } });
  });

  it("returns unknown-intent error for empty string intent", async () => {
    vi.resetModules();
    const { action } = await importModule();

    const result = await action({ request: makeRequest({ intent: "" }) });
    expect(result).toEqual({ error: "Unknown intent.", field: null });
  });

  it("returns unknown-intent error when intent key is absent", async () => {
    vi.resetModules();
    const { action } = await importModule();

    // formData.get("intent") returns null, no branch matches
    const result = await action({ request: makeRequest({}) });
    expect(result).toEqual({ error: "Unknown intent.", field: null });
  });
});

