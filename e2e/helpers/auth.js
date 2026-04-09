import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { sleep } from "./waits.js";

const COOKIE_FILE = resolve(process.cwd(), ".e2e-cookies.json");

function getStoreConfig() {
  const storeUrl = process.env.SHOPIFY_TEST_STORE_URL;

  if (!storeUrl) {
    throw new Error(
      "Missing SHOPIFY_TEST_STORE_URL in .env.e2e file.",
    );
  }

  const cleanStore = storeUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const storeName = cleanStore.replace(".myshopify.com", "");
  const appPath = process.env.SHOPIFY_TEST_APP_PATH || "apps/ab-insightful-1/app";

  return { storeUrl: cleanStore, storeName, appPath };
}

async function saveCookies(driver) {
  const cookies = await driver.manage().getCookies();
  writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2));
  console.log(`[e2e-auth] Saved ${cookies.length} cookies`);
}

async function loadCookies(driver) {
  if (!existsSync(COOKIE_FILE)) {
    return false;
  }

  try {
    const cookies = JSON.parse(readFileSync(COOKIE_FILE, "utf-8"));
    if (!cookies.length) return false;

    const byDomain = {};
    for (const cookie of cookies) {
      const domain = cookie.domain.replace(/^\./, "");
      if (!byDomain[domain]) byDomain[domain] = [];
      byDomain[domain].push(cookie);
    }

    for (const [domain, domainCookies] of Object.entries(byDomain)) {
      try {
        await driver.get(`https://${domain}`);
        await sleep(1000);
        for (const cookie of domainCookies) {
          try {
            const cleanCookie = {
              name: cookie.name,
              value: cookie.value,
              path: cookie.path || "/",
              domain: cookie.domain,
              secure: cookie.secure || false,
              httpOnly: cookie.httpOnly || false,
            };
            if (cookie.expiry) cleanCookie.expiry = cookie.expiry;
            await driver.manage().addCookie(cleanCookie);
          } catch {
            // Some cookies may fail (e.g., SameSite restrictions)
          }
        }
      } catch {
        // Domain may not be reachable
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Log in to the Shopify Admin using cookie-based session reuse.
 *
 * Shopify's hCaptcha blocks all ChromeDriver-launched browsers, so
 * automated login is not possible. Instead:
 *
 *   1. First run: `npm run test:e2e:setup` opens a real Chrome.
 *      User logs in manually. Then `npm run test:e2e:headed` attaches
 *      Selenium and saves cookies.
 *   2. Subsequent runs: `npm run test:e2e` loads saved cookies headlessly.
 */
export async function loginToShopifyAdmin(driver) {
  const { storeName } = getStoreConfig();
  const adminUrl = `https://admin.shopify.com/store/${storeName}`;

  const hasCookies = await loadCookies(driver);

  if (hasCookies) {
    await driver.get(adminUrl);
    await sleep(5000);

    const url = await driver.getCurrentUrl();
    if (url.includes("admin.shopify.com") && !url.includes("accounts.shopify.com")) {
      console.log("[e2e-auth] Cookie login successful");
      return;
    }
    console.log("[e2e-auth] Saved cookies expired");
  }

  const isHeaded = process.env.HEADED === "true";

  if (!isHeaded) {
    throw new Error(
      "No valid session cookies. Set up a login session first:\n\n" +
        "  1. npm run test:e2e:setup   (opens Chrome — log in to Shopify)\n" +
        "  2. npm run test:e2e:headed  (saves cookies, runs tests)\n" +
        "  3. npm run test:e2e         (headless, reuses cookies)\n",
    );
  }

  // Headed mode: Selenium is attached to the user's running Chrome.
  const currentUrl = await driver.getCurrentUrl();

  if (currentUrl.includes("admin.shopify.com") && !currentUrl.includes("accounts.shopify.com")) {
    console.log("[e2e-auth] Already logged in, saving cookies");
    await saveCookies(driver);
    return;
  }

  console.log("[e2e-auth] Waiting for manual login in Chrome window...");

  await driver.wait(async () => {
    const url = await driver.getCurrentUrl();
    return url.includes("admin.shopify.com") && !url.includes("accounts.shopify.com");
  }, 180_000, "Login timed out. Please log in to Shopify in the Chrome window.");

  await sleep(3000);
  await saveCookies(driver);
}

/**
 * Navigate to the embedded app's home page within the Shopify Admin.
 */
export async function navigateToApp(driver) {
  const { storeName, appPath } = getStoreConfig();
  const appUrl = `https://admin.shopify.com/store/${storeName}/${appPath}`;

  await driver.get(appUrl);

  await driver.wait(async () => {
    const url = await driver.getCurrentUrl();
    return url.includes("/apps/");
  }, 30_000, "Timed out navigating to app");

  await sleep(5000);
}

/**
 * Navigate to a specific app route within the Shopify Admin.
 *
 * In embedded apps, nav links (s-link) are rendered by App Bridge in the
 * parent frame and have zero size in the iframe. We navigate by loading
 * the full admin URL, then the caller re-enters the iframe.
 *
 * @param {string} appRoute - e.g. "/app/experiments"
 */
export async function navigateToAppRoute(driver, appRoute) {
  const { storeName, appPath } = getStoreConfig();
  const routeSuffix = appRoute.replace(/^\/app\/?/, "");
  const fullPath = routeSuffix ? `${appPath}/${routeSuffix}` : appPath;
  const fullUrl = `https://admin.shopify.com/store/${storeName}/${fullPath}`;

  await driver.switchTo().defaultContent();
  await driver.get(fullUrl);

  await driver.wait(async () => {
    const url = await driver.getCurrentUrl();
    return url.includes("/apps/");
  }, 30_000, `Timed out navigating to ${appRoute}`);

  await sleep(5000);
}
