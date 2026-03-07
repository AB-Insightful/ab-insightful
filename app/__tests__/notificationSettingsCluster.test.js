import { describe, it, expect, vi, beforeEach } from 'vitest';

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
