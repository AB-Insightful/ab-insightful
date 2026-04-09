# E2E Tests (Selenium)

End-to-end tests that run against the live app embedded in the Shopify Admin.

## Prerequisites

- **Node.js** ≥ 20.10
- **Google Chrome** installed
- A **Shopify development store** with the app installed
- The app dev server running (`shopify app dev`)

## Setup

### 1. Create `.env.e2e`

Copy the example and fill in your store details:

```bash
cp .env.e2e.example .env.e2e
```

| Variable                 | Description                         | Example                    |
| ------------------------ | ----------------------------------- | -------------------------- |
| `SHOPIFY_TEST_STORE_URL` | Your dev store domain (no protocol) | `my-store.myshopify.com`   |
| `SHOPIFY_TEST_APP_PATH`  | App path from the admin URL         | `apps/ab-insightful-1/app` |

To find `SHOPIFY_TEST_APP_PATH`: open your app in the Shopify Admin and copy the path after `/store/{store-name}/` from the URL.

### 2. First-time login (save cookies)

Shopify's login page uses hCaptcha which blocks automated browsers. You need to log in manually once to save session cookies.

**Terminal 1** — launch a real Chrome using the setup script:

```bash
npm run test:e2e:setup
```

Chrome opens to the Shopify Admin. Log in, solve any captcha, and land on the admin dashboard. **Leave Chrome open and the above script running.**

**Terminal 2** — connect Selenium and save cookies:

```bash
npm run test:e2e:headed
```

This attaches to your Chrome, saves cookies to `.e2e-cookies.json`, and runs the tests. You should see the tests pass.

### 3. Run tests

After cookies are saved, run headless:

```bash
npm run test:e2e
```

When cookies expire (you'll see an error telling you), repeat step 2.

## Scripts

| Command                   | Description                                           |
| ------------------------- | ----------------------------------------------------- |
| `npm run test:e2e:setup`  | Opens Chrome for manual Shopify login (cross-platform) |
| `npm run test:e2e:headed` | Connects to running Chrome, saves cookies, runs tests |
| `npm run test:e2e`        | Runs tests headless using saved cookies               |

## How it works

Shopify apps are embedded in an iframe inside the Shopify Admin. The test flow is:

1. **Auth** — Load saved cookies into a headless Chrome to authenticate with the Shopify Admin, skipping the captcha-protected login page.
2. **Navigate** — Load the app's admin URL. The Shopify Admin renders the app inside an iframe.
3. **Iframe switch** — Selenium switches context into the app iframe to interact with app content.
4. **Page navigation** — App Bridge renders nav links in the parent frame (not the iframe), so page changes are done by loading the full admin URL rather than clicking nav links.

## Writing new tests

### File naming

Tests go in `e2e/tests/` with the suffix `.e2e.test.js`.

### Template

```js
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { By } from "selenium-webdriver";
import { createDriver, quitDriver } from "../helpers/driver.js";
import { loginToShopifyAdmin, navigateToAppRoute } from "../helpers/auth.js";
import { switchToAppIframe, waitForAppReady } from "../helpers/iframe.js";
import { getTextContent } from "../helpers/shadow.js";

describe("My Feature", () => {
  let driver;

  beforeAll(async () => {
    driver = await createDriver();
    await loginToShopifyAdmin(driver);
    // Navigate to the page you want to test
    await navigateToAppRoute(driver, "/app/my-page");
    await switchToAppIframe(driver);
    await waitForAppReady(driver);
  });

  afterAll(async () => {
    await quitDriver(driver);
  });

  it("should show expected content", async () => {
    const body = await driver.findElement(By.css("body"));
    const text = await getTextContent(driver, body);
    expect(text).toContain("Expected text");
  });
});
```

### Navigating between pages

Don't click `s-link` elements — they have zero size because App Bridge renders them in the parent frame. Use URL navigation instead:

```js
await navigateToAppRoute(driver, "/app/experiments");
await switchToAppIframe(driver);
await waitForAppReady(driver);
```

### Clicking buttons and filling forms

Standard HTML elements inside the iframe work normally:

```js
// Click a button
const btn = await driver.findElement(By.css("button"));
await btn.click();

// Fill an input
const input = await driver.findElement(By.css("input[name='title']"));
await input.clear();
await input.sendKeys("My experiment");
```

For elements that resist normal clicks (shadow DOM), use `jsClick`:

```js
import { jsClick } from "../helpers/shadow.js";
await jsClick(driver, element);
```

## Helpers

| Module              | Exports                                                      | Purpose                  |
| ------------------- | ------------------------------------------------------------ | ------------------------ |
| `helpers/auth.js`   | `loginToShopifyAdmin`, `navigateToApp`, `navigateToAppRoute` | Auth and navigation      |
| `helpers/iframe.js` | `switchToAppIframe`, `switchToParent`, `waitForAppReady`     | Iframe context switching |
| `helpers/shadow.js` | `getTextContent`, `jsClick`                                  | Shadow DOM interaction   |
| `helpers/waits.js`  | `waitForElement`, `waitForText`, `sleep`                     | Wait utilities           |

## Troubleshooting

**"No valid session cookies"** — Run `npm run test:e2e:setup` + `npm run test:e2e:headed` to refresh cookies.

**"Chrome not found"** — Set `CHROME_PATH` to your Chrome binary:

```bash
CHROME_PATH=/usr/bin/google-chrome npm run test:e2e:setup
```

On Windows (PowerShell), example:

```powershell
$env:CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"; npm run test:e2e:setup
```

**Tests are slow** — Each page navigation takes ~5-7s (URL reload + iframe switch + React hydration). Test multiple assertions per page load when possible.

**"App iframe not found"** — Make sure the app dev server is running (`npm run dev`).
