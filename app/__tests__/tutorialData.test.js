import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as tutorialService from '../services/tutorialData.server';
import db from '../db.server';

// Mock the Prisma client
vi.mock('../db.server', () => ({
  default: {
    tutorialData: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe('tutorialData.server.js Unit Tests', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('getTutorialData', () => {
    it('queries the first tutorial record with ID 1', async () => {
      const mockData = { id: 1, onSiteTracking: false };
      db.tutorialData.findFirst.mockResolvedValue(mockData);

      const result = await tutorialService.getTutorialData();

      expect(db.tutorialData.findFirst).toHaveBeenCalledWith({
        where: { id: 1 },
      });
      expect(result).toEqual(mockData);
    });
  });

  describe('setOnSiteTracking', () => {
    it('successfully updates the onSiteTracking column', async () => {
      const tutId = "session-123";
      const input = true;

      await tutorialService.setOnSiteTracking(tutId, input);

      expect(db.tutorialData.update).toHaveBeenCalledWith({
        where: { id: tutId },
        data: { onSiteTracking: true },
      });
    });

    it('throws a "Database query failed" error when Prisma fails', async () => {
      // Force the mock to throw an error
      db.tutorialData.update.mockRejectedValue(new Error('Prisma Connection Failed'));

      await expect(tutorialService.setOnSiteTracking(1, true))
        .rejects
        .toThrow('Database query failed');
    });
  });

  describe('setGeneralSettings', () => {
    it('updates generalSettings correctly', async () => {
      await tutorialService.setGeneralSettings(1, { theme: 'dark' });

      expect(db.tutorialData.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { generalSettings: { theme: 'dark' } },
      });
    });
  });

  describe('setViewedListExp', () => {
    it('updates viewedListExperiment field correctly', async () => {
      const tutId = 1;
      const input = true;

      await tutorialService.setViewedListExp(tutId, input);

      expect(db.tutorialData.update).toHaveBeenCalledWith({
        where: { id: tutId },
        data: { viewedListExperiment: input },
      });
    });
  });

  describe('setViewedReportsPage', () => {
    it('updates viewedReportsPage field correctly', async () => {
      const tutId = 1;
      const input = true;

      await tutorialService.setViewedReportsPage(tutId, input);

      expect(db.tutorialData.update).toHaveBeenCalledWith({
        where: { id: tutId },
        data: { viewedReportsPage: input },
      });
    });
  });

  describe('setCreateExpPage', () => {
    it('updates createExperiment field correctly', async () => {
      const tutId = 1;
      const input = true;

      await tutorialService.setCreateExpPage(tutId, input);

      expect(db.tutorialData.update).toHaveBeenCalledWith({
        where: { id: tutId },
        data: { createExperiment: input },
      });
    });
  });
});