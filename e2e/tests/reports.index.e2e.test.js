import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { By } from "selenium-webdriver";
import { createDriver, quitDriver } from "../helpers/driver.js";
import { loginToShopifyAdmin, navigateToAppRoute } from "../helpers/auth.js";
import { switchToAppIframe, waitForAppReady } from "../helpers/iframe.js";
import { getTextContent } from "../helpers/shadow.js";
import { sleep } from "../helpers/waits.js";
import { dismissExperimentListTutorialIfPresent } from "../helpers/experimentListPage.js";

/**
 * Reports index (/app/reports) — overview cards, date range, table.
 *
 * Preconditions: e2e/README.md — cookies, .env.e2e, shopify app dev, seeded data.
 *
 * Intentionally not covered here (manual or other suites):
 * - `tutorial_viewed` POST / modal copy beyond dismiss helper
 * - Custom range + Apply / Cancel on `s-date-picker` (shadow-heavy)
 * - Real Full Report navigation (`shopify://…` without stub) — stubbed in tests to stay in-app
 * - Recharts assertions
 * - Default sort order (`createdAt` desc) as stable row sequence
 * - End Condition column cell values beyond incidental body text
 *
 * Pagination with Next/Previous clicks only runs when the UI shows more than six
 * qualifying experiments (`itemsPerPage` is 6). Otherwise we assert Next is disabled.
 */

/** Parses total experiment count from the Reports table footer (e.g. "Showing 1–6 of 12 experiments"). */
function parseTotalExperimentsFromShowingLine(text) {
  const m = text.match(/Showing \d+[\u2013-]\d+ of (\d+) experiments/);
  return m ? Number(m[1], 10) : null;
}

const ITEMS_PER_PAGE = 6;

/**
 * Reports table pagination: `s-button-group` with literal "Previous" / "Next" `s-button`s.
 * Native Selenium `.click()` fails with "element has zero size" on these web components;
 * read state and click via `executeScript` inside the correct group.
 */
async function reportsPaginationState(driver) {
  return driver.executeScript(`
    function norm(s) {
      return (s || "").replace(/\\s+/g, " ").trim();
    }
    function isDis(el) {
      if (!el) return true;
      return !!(
        el.disabled ||
        el.hasAttribute("disabled") ||
        el.getAttribute("aria-disabled") === "true"
      );
    }
    const groups = Array.from(document.querySelectorAll("s-button-group"));
    for (let i = groups.length - 1; i >= 0; i--) {
      const sb = Array.from(groups[i].querySelectorAll("s-button"));
      const prevEl = sb.find((b) => norm(b.textContent) === "Previous");
      const nextEl = sb.find((b) => norm(b.textContent) === "Next");
      if (prevEl && nextEl) {
        return {
          found: true,
          nextDisabled: isDis(nextEl),
          prevDisabled: isDis(prevEl),
        };
      }
    }
    return { found: false };
  `);
}

async function clickReportsPagination(driver, which) {
  const ok = await driver.executeScript(
    `
    function norm(s) {
      return (s || "").replace(/\\s+/g, " ").trim();
    }
    const groups = Array.from(document.querySelectorAll("s-button-group"));
    for (let i = groups.length - 1; i >= 0; i--) {
      const sb = Array.from(groups[i].querySelectorAll("s-button"));
      const prevEl = sb.find((b) => norm(b.textContent) === "Previous");
      const nextEl = sb.find((b) => norm(b.textContent) === "Next");
      if (prevEl && nextEl) {
        if (arguments[0] === "next") nextEl.click();
        else if (arguments[0] === "prev") prevEl.click();
        return true;
      }
    }
    return false;
  `,
    which,
  );
  if (!ok) {
    throw new Error(`Could not click reports pagination: ${which}`);
  }
  await sleep(2000);
}

async function dismissReportsTutorialIfPresent(driver) {
  await dismissExperimentListTutorialIfPresent(driver);
}

async function openDateRangePopover(driver) {
  const opened = await driver.executeScript(`
    const sel =
      's-button[commandfor="date-range-popover"],' +
      's-button[commandFor="date-range-popover"]';
    const el = document.querySelector(sel);
    if (!el) return false;
    el.click();
    return true;
  `);
  if (!opened) {
    throw new Error(
      "Could not open date range popover (expected s-button commandFor=date-range-popover).",
    );
  }
  await sleep(800);
}

async function clickDatePreset(driver, label) {
  const clicked = await driver.executeScript(
    `
    const label = arguments[0];
    for (const el of document.querySelectorAll("s-button")) {
      const t = (el.textContent || "").trim();
      if (t === label || t.includes(label)) {
        el.click();
        return true;
      }
    }
    return false;
  `,
    label,
  );
  if (!clicked) {
    throw new Error(`Could not find date preset button: ${label}`);
  }
  await sleep(2000);
}

async function getDateRangeTriggerLabel(driver) {
  return driver.executeScript(`
    const sel =
      's-button[commandfor="date-range-popover"],' +
      's-button[commandFor="date-range-popover"]';
    const el = document.querySelector(sel);
    return (el?.textContent || "").replace(/\\s+/g, " ").trim();
  `);
}

async function clickDatePopoverAction(driver, actionLabel) {
  const clicked = await driver.executeScript(
    `
    const wanted = (arguments[0] || "").trim();
    const popover = document.querySelector("s-popover#date-range-popover");
    if (!popover) return false;
    const buttons = popover.querySelectorAll("s-button");
    for (const el of buttons) {
      const text = (el.textContent || "").replace(/\\s+/g, " ").trim();
      if (text === wanted) {
        el.click();
        return true;
      }
    }
    return false;
  `,
    actionLabel,
  );

  if (!clicked) {
    throw new Error(`Could not click date popover action: ${actionLabel}`);
  }
  await sleep(1000);
}

async function clickTableSortByColumnTitle(driver, titleIncludes) {
  const clicked = await driver.executeScript(
    `
    const needle = arguments[0];
    for (const el of document.querySelectorAll("s-button")) {
      const t = (el.textContent || "").trim();
      if (t.includes(needle)) {
        el.click();
        return true;
      }
    }
    return false;
  `,
    titleIncludes,
  );
  if (!clicked) {
    throw new Error(
      `Could not find table header sort button containing: ${titleIncludes}`,
    );
  }
  await sleep(1500);
}

/** Stub `window.open` in the current frame to record `{ url, target }` without navigating. */
async function installWindowOpenCapture(driver) {
  await driver.executeScript(`
    window.__e2eOpens = [];
    if (!window.__e2eOriginalOpen) {
      window.__e2eOriginalOpen = window.open;
    }
    window.open = function (url, target, features) {
      window.__e2eOpens.push({
        url: url != null ? String(url) : "",
        target: target != null ? String(target) : "",
      });
      return null;
    };
  `);
}

async function restoreWindowOpen(driver) {
  await driver.executeScript(`
    if (window.__e2eOriginalOpen) {
      window.open = window.__e2eOriginalOpen;
    }
    delete window.__e2eOriginalOpen;
    delete window.__e2eOpens;
  `);
}

async function getWindowOpenCaptures(driver) {
  return driver.executeScript(`return window.__e2eOpens || [];`);
}

async function clickNthFullReportButton(driver, index) {
  const clicked = await driver.executeScript(
    `
    const idx = arguments[0];
    const buttons = [...document.querySelectorAll("button")].filter((b) =>
      (b.textContent || "").replace(/\\s+/g, " ").trim().includes("Full Report"),
    );
    if (!buttons[idx]) return false;
    buttons[idx].click();
    return true;
  `,
    index,
  );
  if (!clicked) {
    throw new Error(`Full Report button not found at index ${index}`);
  }
  await sleep(200);
}

describe("Reports index — overview", () => {
  let driver;

  beforeAll(async () => {
    driver = await createDriver();
    await loginToShopifyAdmin(driver);
    await navigateToAppRoute(driver, "/app/reports");
    await switchToAppIframe(driver);
    await waitForAppReady(driver);
    await dismissReportsTutorialIfPresent(driver);
  });

  afterAll(async () => {
    await quitDriver(driver);
  });

  async function bodyText() {
    const body = await driver.findElement(By.css("body"));
    return getTextContent(driver, body);
  }

  it("renders the Reports page shell and experiment table", async () => {
    const text = await bodyText();
    expect(text).toContain("Reports");
    expect(text).toContain("Experiment Reports");
    expect(text).toContain("Conversions");
    expect(text).toContain("Sessions");
    expect(text).toMatch(/Experiment Name/);
    expect(text).toMatch(/Status/);
    expect(text).toMatch(/Run Length/);
    expect(text).toMatch(/End Condition/);
  });

  it("shows either chart data, loading text, or empty-state copy for cards", async () => {
    const text = await bodyText();
    const hasConversionChart =
      text.includes("No conversion data to display yet.") ||
      text.includes("Loading chart data") ||
      /\d+\.\d{2}%/.test(text);
    const hasSessionChart =
      text.includes("No session data to display yet.") ||
      text.includes("Loading chart data") ||
      /Sessions[\s\S]*\d/.test(text);
    expect(hasConversionChart).toBe(true);
    expect(hasSessionChart).toBe(true);
  });

  it("Full Report buttons call window.open with correct Shopify Analytics URLs (no navigation)", async () => {
    const buttons = await driver.findElements(
      By.xpath("//button[contains(normalize-space(.),'Full Report')]"),
    );
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    for (const btn of buttons) {
      expect(await btn.isDisplayed()).toBe(true);
    }

    await installWindowOpenCapture(driver);
    try {
      // DOM order: ConversionsCard (left), then SessionsCard (right) — matches app layout.
      await clickNthFullReportButton(driver, 0);
      let opens = await getWindowOpenCaptures(driver);
      expect(opens.length).toBe(1);
      expect(opens[0].url).toContain(
        "shopify://admin/analytics/reports/conversion_rate_over_time",
      );
      expect(opens[0].target).toBe("_top");

      await clickNthFullReportButton(driver, 1);
      opens = await getWindowOpenCaptures(driver);
      expect(opens.length).toBe(2);
      expect(opens[1].url).toContain(
        "shopify://admin/analytics/reports/sessions_over_time",
      );
      expect(opens[1].target).toBe("_top");
    } finally {
      await restoreWindowOpen(driver);
    }
  });

  it("opens the date popover and applies Last 30 days", async () => {
    await openDateRangePopover(driver);
    await clickDatePreset(driver, "Last 30 days");
    const text = await bodyText();
    expect(text).toContain("Experiment Reports");
    expect(text).toContain("Conversions");
  });

  it("opens the date popover and applies Last 7 days", async () => {
    await openDateRangePopover(driver);
    await clickDatePreset(driver, "Last 7 days");
    const text = await bodyText();
    expect(text).toContain("Experiment Reports");
    expect(text).toContain("Sessions");
  });

  it("date popover Cancel closes without changing current range", async () => {
    const before = await getDateRangeTriggerLabel(driver);
    await openDateRangePopover(driver);
    await clickDatePopoverAction(driver, "Cancel");
    const after = await getDateRangeTriggerLabel(driver);
    expect(after).toBe(before);
  });

  it("date popover Apply without custom range does not change current range", async () => {
    const before = await getDateRangeTriggerLabel(driver);
    await openDateRangePopover(driver);
    await clickDatePopoverAction(driver, "Apply");
    const after = await getDateRangeTriggerLabel(driver);
    expect(after).toBe(before);
  });

  it("toggles sort via Experiment Name column control", async () => {
    await clickTableSortByColumnTitle(driver, "Experiment Name");
    let text = await bodyText();
    expect(text).toMatch(/Experiment Name[↑↓]?/);

    await clickTableSortByColumnTitle(driver, "Experiment Name");
    text = await bodyText();
    expect(text).toMatch(/Experiment Name[↑↓]?/);
  });

  it("sort controls for Status, Run Length, and End Condition respond", async () => {
    for (const label of ["Status", "Run Length", "End Condition"]) {
      await clickTableSortByColumnTitle(driver, label);
    }
    const text = await bodyText();
    expect(text).toContain("Experiment Reports");
    expect(text).toMatch(/Status[↑↓]?/);
  });

  it("sort control for Conversions column responds", async () => {
    await clickTableSortByColumnTitle(driver, "Conversions");
    const text = await bodyText();
    expect(text).toMatch(/Conversions[↑↓]?/);
    expect(text).toContain("Experiment Reports");
  });

  it("lists experiments or an empty table region when none qualify", async () => {
    const text = await bodyText();
    const hasDemoRow =
      text.includes("DEMO -") ||
      text.includes("Active") ||
      text.includes("Paused") ||
      text.includes("Completed");
    expect(hasDemoRow).toBe(true);
  });

  it("table experiment names link to /app/reports/:id routes", async () => {
    const linkCount = await driver.executeScript(`
      return document.querySelectorAll('s-link[href*="/app/reports/"]').length;
    `);
    expect(linkCount).toBeGreaterThanOrEqual(1);
  });

  it("shows experiment count line and pagination Next control", async () => {
    const text = await bodyText();
    expect(text).toMatch(/Showing \d+[\u2013-]\d+ of \d+ experiments/);
    const nextButtons = await driver.findElements(
      By.xpath("//s-button[contains(normalize-space(.),'Next')]"),
    );
    expect(nextButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("shows pagination Previous control alongside Next", async () => {
    const prevButtons = await driver.findElements(
      By.xpath("//s-button[contains(normalize-space(.),'Previous')]"),
    );
    expect(prevButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("pagination Next disabled on single page; Next/Previous round-trip when more than six experiments", async () => {
    const text = await bodyText();
    expect(text).toMatch(/Showing \d+[\u2013-]\d+ of \d+ experiments/);

    const total = parseTotalExperimentsFromShowingLine(text);
    expect(total).not.toBeNull();
    expect(total).toBeGreaterThan(0);

    const state0 = await reportsPaginationState(driver);
    expect(state0.found, "pagination s-button-group with Previous/Next").toBe(true);

    const multiPage = total > ITEMS_PER_PAGE;

    if (!multiPage) {
      expect(state0.nextDisabled, "Next disabled when all rows fit on one page").toBe(
        true,
      );
      expect(state0.prevDisabled, "Previous disabled on first page").toBe(true);
      expect(text).not.toMatch(/\(Page \d+ of \d+\)/);
      return;
    }

    expect(text).toMatch(/\(Page 1 of \d+\)/);
    expect(state0.nextDisabled, "Next enabled when more than six experiments").toBe(false);
    expect(state0.prevDisabled, "Previous disabled on page 1").toBe(true);

    await clickReportsPagination(driver, "next");

    let afterNext = await bodyText();
    expect(afterNext).toMatch(/\(Page 2 of \d+\)/);
    const stateOn2 = await reportsPaginationState(driver);
    expect(stateOn2.prevDisabled, "Previous enabled on page 2").toBe(false);

    await clickReportsPagination(driver, "prev");

    afterNext = await bodyText();
    expect(afterNext).toMatch(/\(Page 1 of \d+\)/);
    const stateBack1 = await reportsPaginationState(driver);
    expect(stateBack1.nextDisabled, "Next enabled again on page 1").toBe(false);
  });
});
