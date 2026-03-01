import { vi } from 'vitest';
import '@testing-library/jest-dom';

// Mock Environment Variables (Satisfies Shopify's internal config check)
process.env.SHOPIFY_APP_URL = 'https://test.com';
process.env.SHOPIFY_API_KEY = 'test_key';
process.env.SHOPIFY_API_SECRET = 'test_secret';

// Global mock for Shopify App Bridge
vi.mock('@shopify/app-bridge-react', () => ({
  useAppBridge: () => ({
    toast: { show: vi.fn() },
    modal: { show: vi.fn(), hide: vi.fn() },
  }),
}));

// Global mock for Shopify Server Authenticate
vi.mock('../shopify.server', () => ({
  default: {
    authenticate: {
      admin: vi.fn(),
    },
  },
  authenticate: {
    admin: vi.fn(),
  },
}));