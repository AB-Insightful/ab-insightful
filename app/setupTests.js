import { vi, beforeEach, afterEach } from 'vitest';
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

// Register custom elements so jsdom doesn't choke
function defineOnce(tag) {
  if (!customElements.get(tag)) {
    customElements.define(tag, class extends HTMLElement {});
  }
}

defineOnce("s-text-field");
defineOnce("s-button");
defineOnce("s-popover");
defineOnce("s-stack");
defineOnce("s-page");
defineOnce("s-section");
defineOnce("s-menu");
defineOnce("s-paragraph");
defineOnce("s-text");
defineOnce("s-button-group");
defineOnce("s-link");

// Patch document.createElement so <s-text-field> acts like a real input for tests
const originalCreateElement = document.createElement.bind(document);

beforeEach(() => {
  document.createElement = ((tagName, options) => {
    if (tagName === "s-text-field") {
      const host = originalCreateElement("s-text-field");

      const input = originalCreateElement("input");
      input.setAttribute("data-testid", "time-input");
      host.appendChild(input);

      // property bridge (used by tests)
      Object.defineProperty(host, "value", {
        get() {
          return input.value;
        },
        set(v) {
          input.value = v ?? "";
        },
      });

      // IMPORTANT: React sets attributes on custom elements (value="...")
      // So keep the inner input in sync whenever that happens.
      const observer = new MutationObserver(() => {
        const attrVal = host.getAttribute("value");
        if (attrVal !== null && input.value !== attrVal) {
          input.value = attrVal;
        }
      });

      observer.observe(host, { attributes: true, attributeFilter: ["value"] });

      return host;
    }

    if (tagName === "s-button") {
      const btn = originalCreateElement("button");
      btn.setAttribute("data-s-button", "true");
      return btn;
    }

    if (
      tagName === "s-popover" ||
      tagName === "s-stack" ||
      tagName === "s-page" ||
      tagName === "s-section" ||
      tagName === "s-menu" ||
      tagName === "s-paragraph" ||
      tagName === "s-text" ||
      tagName === "s-button-group"
    ) {
      const div = originalCreateElement("div");
      div.setAttribute(`data-${tagName}`, "true");
      return div;
    }

    return originalCreateElement(tagName, options);
  });
});

afterEach(() => {
  document.createElement = originalCreateElement;
});