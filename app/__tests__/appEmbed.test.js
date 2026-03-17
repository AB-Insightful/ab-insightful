import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyAppEmbed } from '../services/appEmbed.server';

describe('verifyAppEmbed', () => {
  const mockAdmin = {
    graphql: vi.fn(),
  };

  const mockSession = {
    shop: 'test-shop.myshopify.com',
    accessToken: 'shp_test_token',
  };

  const typePrefix = 'ab-insightful';

  beforeEach(() => {
    vi.resetAllMocks();
    // Global fetch mock (REST API)
    global.fetch = vi.fn();
  });

  it('returns isEnabled: true when the embed is found and active', async () => {
    // Mock GraphQL Theme Response
    mockAdmin.graphql.mockResolvedValue({
      json: () => Promise.resolve({
        data: { themes: { nodes: [{ id: 'gid://shopify/Theme/12345', name: 'Dawn' }] } }
      }),
    });

    // Mock REST Response with settings_data.json
    const mockSettings = {
      current: {
        blocks: {
          "some-uuid": { type: `shopify://.../${typePrefix}/...`, disabled: false }
        }
      }
    };

    global.fetch.mockResolvedValue({
      json: () => Promise.resolve({ asset: { value: JSON.stringify(mockSettings) } }),
    });

    const result = await verifyAppEmbed(mockAdmin, typePrefix, mockSession);

    expect(result.isEnabled).toBe(true);
    expect(result.themeName).toBe('Dawn');
  });

  it('returns isEnabled: false when the embed is disabled in settings', async () => {
    mockAdmin.graphql.mockResolvedValue({
      json: () => Promise.resolve({
        data: { themes: { nodes: [{ id: 'gid://shopify/Theme/12345', name: 'Dawn' }] } }
      }),
    });

    const mockSettings = {
      current: {
        blocks: {
          "some-uuid": { type: `shopify://.../${typePrefix}/...`, disabled: true }
        }
      }
    };

    global.fetch.mockResolvedValue({
      json: () => Promise.resolve({ asset: { value: JSON.stringify(mockSettings) } }),
    });

    const result = await verifyAppEmbed(mockAdmin, typePrefix, mockSession);

    expect(result.isEnabled).toBe(false);
  });

  it('returns isEnabled: false if no main theme is found', async () => {
    mockAdmin.graphql.mockResolvedValue({
      json: () => Promise.resolve({ data: { themes: { nodes: [] } } }),
    });

    const result = await verifyAppEmbed(mockAdmin, typePrefix, mockSession);

    expect(result.isEnabled).toBe(false);
    expect(result.themeName).toBe('Unknown');
  });

  it('throws an error if no session is provided', async () => {
    mockAdmin.graphql.mockResolvedValue({
      json: () => Promise.resolve({
        data: { themes: { nodes: [{ id: 'gid://shopify/Theme/123', name: 'Test' }] } }
      }),
    });

    const result = await verifyAppEmbed(mockAdmin, typePrefix, null);

    expect(result.isEnabled).toBe(false);
    expect(result.error).toContain('No session provided');
  });

  it('catches and returns error if fetch fails', async () => {
    mockAdmin.graphql.mockResolvedValue({
      json: () => Promise.resolve({
        data: { themes: { nodes: [{ id: 'gid://shopify/Theme/123', name: 'Test' }] } }
      }),
    });

    global.fetch.mockRejectedValue(new Error('Network Failure'));

    const result = await verifyAppEmbed(mockAdmin, typePrefix, mockSession);

    expect(result.isEnabled).toBe(false);
    expect(result.themeName).toBe('Error');
    expect(result.error).toBe('Network Failure');
  });

  it('returns isEnabled: false if asset value is missing', async () => {
    mockAdmin.graphql.mockResolvedValue({
      json: () => Promise.resolve({
        data: { themes: { nodes: [{ id: 'gid://shopify/Theme/123', name: 'Test' }] } }
      }),
    });

    // Mock the REST response to return no asset value
    global.fetch.mockResolvedValue({
      json: () => Promise.resolve({ asset: { value: null } }),
    });

    const result = await verifyAppEmbed(mockAdmin, typePrefix, mockSession);

    expect(result.isEnabled).toBe(false);
    expect(result.themeName).toBe('Test');
  });
});