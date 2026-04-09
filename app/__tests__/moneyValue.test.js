import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the db module before importing persistConversion
vi.mock('../db.server', () => ({
  default: {
    allocation: {
      findFirst: vi.fn(),
    },
    goal: {
      findFirst: vi.fn(),
    },
    conversion: {
      upsert: vi.fn(),
    },
  },
}));

import db from '../db.server';
import { handleCollectedEvent } from '../services/experiment.server.js';

describe('moneyValue storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Simulate a user with an active experiment allocation
    db.allocation.findFirst.mockResolvedValue({
      experimentId: 1,
      variantId: 10,
    });

    // Simulate a matching goal in the DB
    db.goal.findFirst.mockResolvedValue({
      id: 99,
      name: 'Completed Checkout',
    });

    // Simulate a successful DB write, returning what was passed in
    db.conversion.upsert.mockImplementation(({ create }) =>
      Promise.resolve(create),
    );
  });

  it('stores the correct moneyValue from the checkout payload', async () => {
    const payload = {
      event_type: 'checkout_completed',
      client_id: 'customer_abc',
      timestamp: new Date(),
      device_type: 'apple_desktop',
      total_price: '79.99',
    };

    await handleCollectedEvent(payload);

    const upsertCall = db.conversion.upsert.mock.calls[0][0];
    expect(upsertCall.create.moneyValue.toString()).toBe('79.99');
  });

  it('defaults moneyValue to 0 when total_price is missing', async () => {
    const payload = {
      event_type: 'checkout_completed',
      client_id: 'customer_abc',
      timestamp: new Date(),
      device_type: 'apple_desktop',
      // no total_price
    };

    await handleCollectedEvent(payload);

    const upsertCall = db.conversion.upsert.mock.calls[0][0];
    expect(upsertCall.create.moneyValue.toString()).toBe('0');
  });
});