import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db.server", () => ({
  default: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import db from "../db.server";
import {
  getUserbyID,
  createUser,
  updateLatestSession,
} from "../services/cookie.server";

describe("cookie.server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  describe("getUserbyID", () => {
    it("returns customer when customer_id is provided and found", async () => {
      const mockCustomer = {
        id: 1,
        shopifyCustomerID: "cust_123",
      };

      vi.mocked(db.user.findUnique).mockResolvedValue(mockCustomer);

      const result = await getUserbyID("cust_123");

      expect(db.user.findUnique).toHaveBeenCalledWith({
        where: {
          shopifyCustomerID: "cust_123",
        },
      });
      expect(result).toEqual(mockCustomer);
    });

    it("returns null when customer_id is missing", async () => {
      const result = await getUserbyID(undefined);

      expect(db.user.findUnique).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });

  describe("createUser", () => {
    it("creates and returns user when userdata is provided", async () => {
      const payload = {
        shopifyCustomerID: "cust_123",
        latestSession: "sess_1",
        deviceType: "mobile",
      };

      const createdUser = {
        id: 10,
        ...payload,
      };

      vi.mocked(db.user.create).mockResolvedValue(createdUser);

      const result = await createUser(payload);

      expect(db.user.create).toHaveBeenCalledWith({
        data: {
          ...payload,
        },
      });
      expect(result).toEqual(createdUser);
    });

    it("returns null when userdata is missing", async () => {
      const result = await createUser(undefined);

      expect(db.user.create).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });

  describe("updateLatestSession", () => {
    it("upserts and returns the updated user", async () => {
      const payload = {
        client_id: "cust_123",
        latestSession: "2026-04-11T12:00:00.000Z",
        deviceType: "mobile",
      };

      const mockResult = {
        id: 1,
        shopifyCustomerID: "cust_123",
        latestSession: new Date(payload.latestSession),
        deviceType: "mobile",
      };

      vi.mocked(db.user.upsert).mockResolvedValue(mockResult);

      const result = await updateLatestSession(payload);

      expect(db.user.upsert).toHaveBeenCalledWith({
        where: {
          shopifyCustomerID: payload.client_id,
        },
        update: {
          latestSession: new Date(payload.latestSession),
          deviceType: payload.deviceType,
        },
        create: {
          shopifyCustomerID: payload.client_id,
          latestSession: new Date(payload.latestSession),
          deviceType: payload.deviceType,
        },
      });

      expect(result).toEqual(mockResult);
    });

    it("uses null in create and undefined in update when deviceType is missing", async () => {
      const payload = {
        client_id: "cust_123",
        latestSession: "2026-04-11T12:00:00.000Z",
      };

      vi.mocked(db.user.upsert).mockResolvedValue({
        id: 1,
        shopifyCustomerID: "cust_123",
      });

      await updateLatestSession(payload);

      expect(db.user.upsert).toHaveBeenCalledWith({
        where: {
          shopifyCustomerID: payload.client_id,
        },
        update: {
          latestSession: new Date(payload.latestSession),
          deviceType: undefined,
        },
        create: {
          shopifyCustomerID: payload.client_id,
          latestSession: new Date(payload.latestSession),
          deviceType: null,
        },
      });
    });
  });
});