import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setEmailNotifToggle } from '../services/project.server.js';
import { sendEmailStart, sendEmailEnd, sendSMSStart, sendSMSEnd } from '../services/notifications.server.js';

//mock authenticate before importing action
vi.mock('../shopify.server', () => ({
  authenticate: {
    admin: vi.fn(),
  },
}));

vi.mock('../db.server', () => ({
  default: {
    project: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    contactEmail: {
      deleteMany: vi.fn(),
    },
    contactPhone: {
      deleteMany: vi.fn(),
    },
  },
}));

import { authenticate } from '../shopify.server';
import db from '../db.server';
import { action } from '../routes/app.settings';

//helper: build a fake request with formData
function makeRequest(fields) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value);
  }
  return {
    formData: () => Promise.resolve(formData),
  };
}

describe('app.settings action', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    //all tests share the same authenticated shop
    authenticate.admin.mockResolvedValue({
      session: { shop: 'test-shop.myshopify.com' },
    });

    //project.update succeeds by default
    db.project.update.mockResolvedValue({});

    //project.findUnique returns a project with id 1 by default
    db.project.findUnique.mockResolvedValue({ id: 1 });

    //deleteMany succeeds by default
    db.contactEmail.deleteMany.mockResolvedValue({ count: 2 });
    db.contactPhone.deleteMany.mockResolvedValue({ count: 1 });
  });

  // ------------------------------------------------------------------
  //updateExperimentStart
  // ------------------------------------------------------------------
  describe('updateExperimentStart', () => {
    it('saves true to the database when checkbox is checked', async () => {
      const request = makeRequest({ intent: 'updateExperimentStart', value: 'true' });
      const result = await action({ request });

      expect(db.project.update).toHaveBeenCalledWith({
        where: { shop: 'test-shop.myshopify.com' },
        data: { enableExperimentStart: true },
      });
      expect(result).toEqual({ ok: true, intent: 'updateExperimentStart' });
    });

    it('saves false to the database when checkbox is unchecked', async () => {
      const request = makeRequest({ intent: 'updateExperimentStart', value: 'false' });
      const result = await action({ request });

      expect(db.project.update).toHaveBeenCalledWith({
        where: { shop: 'test-shop.myshopify.com' },
        data: { enableExperimentStart: false },
      });
      expect(result).toEqual({ ok: true, intent: 'updateExperimentStart' });
    });
  });

  // ------------------------------------------------------------------
  //updateExperimentEnd
  // ------------------------------------------------------------------
  describe('updateExperimentEnd', () => {
    it('saves true to the database when checkbox is checked', async () => {
      const request = makeRequest({ intent: 'updateExperimentEnd', value: 'true' });
      const result = await action({ request });

      expect(db.project.update).toHaveBeenCalledWith({
        where: { shop: 'test-shop.myshopify.com' },
        data: { enableExperimentEnd: true },
      });
      expect(result).toEqual({ ok: true, intent: 'updateExperimentEnd' });
    });

    it('saves false to the database when checkbox is unchecked', async () => {
      const request = makeRequest({ intent: 'updateExperimentEnd', value: 'false' });
      const result = await action({ request });

      expect(db.project.update).toHaveBeenCalledWith({
        where: { shop: 'test-shop.myshopify.com' },
        data: { enableExperimentEnd: false },
      });
      expect(result).toEqual({ ok: true, intent: 'updateExperimentEnd' });
    });
  });

  // ------------------------------------------------------------------
  //updateMaxUsersPerExperiment
  // ------------------------------------------------------------------
  describe('updateMaxUsersPerExperiment', () => {
    it('saves valid integer to the database', async () => {
      const request = makeRequest({
        intent: 'updateMaxUsersPerExperiment',
        maxUsersPerExperiment: '5000',
      });
      const result = await action({ request });

      expect(db.project.update).toHaveBeenCalledWith({
        where: { shop: 'test-shop.myshopify.com' },
        data: { maxUsersPerExperiment: 5000 },
      });
      expect(result).toEqual({
        ok: true,
        intent: 'updateMaxUsersPerExperiment',
        maxUsersPerExperiment: 5000,
      });
    });

    it('accepts 1 as minimum value', async () => {
      const request = makeRequest({
        intent: 'updateMaxUsersPerExperiment',
        maxUsersPerExperiment: '1',
      });
      const result = await action({ request });

      expect(db.project.update).toHaveBeenCalledWith({
        where: { shop: 'test-shop.myshopify.com' },
        data: { maxUsersPerExperiment: 1 },
      });
      expect(result.ok).toBe(true);
    });

    it('accepts 1,000,000 as maximum value', async () => {
      const request = makeRequest({
        intent: 'updateMaxUsersPerExperiment',
        maxUsersPerExperiment: '1000000',
      });
      const result = await action({ request });

      expect(db.project.update).toHaveBeenCalledWith({
        where: { shop: 'test-shop.myshopify.com' },
        data: { maxUsersPerExperiment: 1000000 },
      });
      expect(result.ok).toBe(true);
    });

    it('returns error when value is not a valid integer', async () => {
      const request = makeRequest({
        intent: 'updateMaxUsersPerExperiment',
        maxUsersPerExperiment: 'abc',
      });
      const result = await action({ request });

      expect(db.project.update).not.toHaveBeenCalled();
      expect(result).toEqual({
        ok: false,
        intent: 'updateMaxUsersPerExperiment',
        error: 'Must be a valid integer',
        field: 'maxUsersPerExperiment',
      });
    });

    it('returns error when value is empty', async () => {
      const request = makeRequest({
        intent: 'updateMaxUsersPerExperiment',
        maxUsersPerExperiment: '',
      });
      const result = await action({ request });

      expect(db.project.update).not.toHaveBeenCalled();
      expect(result).toEqual({
        ok: false,
        intent: 'updateMaxUsersPerExperiment',
        error: 'Must be a valid integer',
        field: 'maxUsersPerExperiment',
      });
    });

    it('returns error when value is less than 1', async () => {
      const request = makeRequest({
        intent: 'updateMaxUsersPerExperiment',
        maxUsersPerExperiment: '0',
      });
      const result = await action({ request });

      expect(db.project.update).not.toHaveBeenCalled();
      expect(result).toEqual({
        ok: false,
        intent: 'updateMaxUsersPerExperiment',
        error: 'Must be at least 1',
        field: 'maxUsersPerExperiment',
      });
    });

    it('returns error when value exceeds 1,000,000', async () => {
      const request = makeRequest({
        intent: 'updateMaxUsersPerExperiment',
        maxUsersPerExperiment: '1000001',
      });
      const result = await action({ request });

      expect(db.project.update).not.toHaveBeenCalled();
      expect(result).toEqual({
        ok: false,
        intent: 'updateMaxUsersPerExperiment',
        error: 'Must be at most 1,000,000',
        field: 'maxUsersPerExperiment',
      });
    });
  });

  // ------------------------------------------------------------------
  //disableNotifications
  // ------------------------------------------------------------------
  describe('disableNotifications', () => {
    it('sets both enableExperimentStart and enableExperimentEnd to false', async () => {
      const request = makeRequest({ intent: 'disableNotifications' });
      const result = await action({ request });

      expect(db.project.update).toHaveBeenCalledWith({
        where: { shop: 'test-shop.myshopify.com' },
        data: { enableExperimentStart: false, enableExperimentEnd: false },
      });
      expect(result).toEqual({ ok: true, intent: 'disableNotifications' });
    });

    it('only calls project.update once (single DB write)', async () => {
      const request = makeRequest({ intent: 'disableNotifications' });
      await action({ request });

      expect(db.project.update).toHaveBeenCalledTimes(1);
    });
  });

  // ------------------------------------------------------------------
  //deleteAll
  // ------------------------------------------------------------------
  describe('deleteAll', () => {
    it('deletes all emails belonging to the current project', async () => {
      const request = makeRequest({ intent: 'deleteAll' });
      await action({ request });

      expect(db.contactEmail.deleteMany).toHaveBeenCalledWith({
        where: { projectId: 1 },
      });
    });

    it('deletes all phones belonging to the current project', async () => {
      const request = makeRequest({ intent: 'deleteAll' });
      await action({ request });

      expect(db.contactPhone.deleteMany).toHaveBeenCalledWith({
        where: { projectId: 1 },
      });
    });

    it('does not delete contacts belonging to a different project', async () => {
      //simulate a different shop with project id 99
      authenticate.admin.mockResolvedValue({
        session: { shop: 'other-shop.myshopify.com' },
      });
      db.project.findUnique.mockResolvedValue({ id: 99 });

      const request = makeRequest({ intent: 'deleteAll' });
      await action({ request });

      //should scope deletes to project 99, not project 1
      expect(db.contactEmail.deleteMany).toHaveBeenCalledWith({
        where: { projectId: 99 },
      });
      expect(db.contactPhone.deleteMany).toHaveBeenCalledWith({
        where: { projectId: 99 },
      });
    });

    it('returns ok: true on success', async () => {
      const request = makeRequest({ intent: 'deleteAll' });
      const result = await action({ request });

      expect(result).toEqual({ ok: true });
    });
  });
});

// ------------------------------------------------------------------
// email notification toggle
// ------------------------------------------------------------------
//shotgun approach since some of these mocks aren't working

vi.mock('../services/project.server.js', () => ({
  setEmailNotifToggle: vi.fn(),
  getEmailNotifToggle: vi.fn(),
}));


vi.mock("../services/notifications.server.js", () => ({
  subscribeEmail: vi.fn(),
  unsubscribeEmail: vi.fn(),
  subscribePhoneNum: vi.fn(),
  unsubscribePhoneNum: vi.fn(),
  unsubscribeAll: vi.fn(),
  unsubscribeAllPhoneNums: vi.fn(),
  sendEmailStart: vi.fn(),
  sendEmailEnd: vi.fn(),
}));

//fixes mock issues
beforeEach(() => {
  vi.clearAllMocks();
  setEmailNotifToggle.mockReset();
  sendEmailStart.mockReset();
  sendEmailStart.mockReset();
  sendEmailEnd.mockReset();
});

it('set_email_notif_false disables email notifications and returns success', async () => {
  setEmailNotifToggle.mockResolvedValue({ id: 1, emailNotifEnabled: false });
  db.project.update.mockResolvedValue({ id: 1, emailNotifEnabled: false });

  const request = makeRequest({ intent: 'set_email_notif_false' });
  const result = await action({ request });

  expect(setEmailNotifToggle).toHaveBeenCalledTimes(1);
  expect(setEmailNotifToggle).toHaveBeenCalledWith(false);

  expect(db.project.update).toHaveBeenCalledTimes(1);
  expect(db.project.update).toHaveBeenCalledWith({
    where: { shop: 'test-shop.myshopify.com' },
    data: { emailNotifEnabled: false },
  });

  expect(sendEmailStart).not.toHaveBeenCalled();

  expect(result).toEqual({
    ok: true,
    intent: 'set_email_notif_false',
  });
});

it('set_email_notif_true enables email notifications and returns success', async () => {
  setEmailNotifToggle.mockResolvedValue({ id: 1, emailNotifEnabled: true });
  db.project.update.mockResolvedValue({ id: 1, emailNotifEnabled: true });

  const request = makeRequest({ intent: 'set_email_notif_true' });
  const result = await action({ request });

  expect(setEmailNotifToggle).toHaveBeenCalledTimes(1);
  expect(setEmailNotifToggle).toHaveBeenCalledWith(true);

  expect(db.project.update).toHaveBeenCalledTimes(1);
  expect(db.project.update).toHaveBeenCalledWith({
    where: { shop: 'test-shop.myshopify.com' },
    data: { emailNotifEnabled: true },
  });

  expect(sendEmailStart).not.toHaveBeenCalled();

  expect(result).toEqual({
    ok: true,
    intent: 'set_email_notif_true',
  });
});

it('set_email_notif_true returns ok:false when setEmailNotifToggle throws and does not send email', async () => {
  setEmailNotifToggle.mockRejectedValue(new Error('DB fail'));
  const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  const request = makeRequest({ intent: 'set_email_notif_true' });
  const result = await action({ request });

  expect(setEmailNotifToggle).toHaveBeenCalledWith(true);
  expect(result).toEqual({ ok: false, error: "failed to change email toggle" });

  errSpy.mockRestore();
});



