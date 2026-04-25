import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { By } from "selenium-webdriver";
import { createDriver, quitDriver } from "../helpers/driver.js";
import { loginToShopifyAdmin, navigateToAppRoute } from "../helpers/auth.js";
import { switchToAppIframe, waitForAppReady } from "../helpers/iframe.js";
import { getTextContent } from "../helpers/shadow.js";
import { dismissExperimentListTutorialIfPresent } from "../helpers/experimentListPage.js";

/**
 * Individual experiment report (/app/reports/:id) — side panel, segment toggle,
 * variant table / empty state, Recharts sections.
 *
 * Preconditions: e2e/README.md — cookies, .env.e2e, app dev, at least one
 * experiment listed on /app/reports (seeded or demo data).
 *
 * Coverage targets:
 * - Smoke: detail page and key regions render
 * - Interaction: segment controls and status popover affordance behave
 * - Contract: key links/routes/computed detail fields are valid
 *
 * Intentionally not covered by default:
 * - Pixel-level chart assertions
 * - DateRangePicker (imported in route but not rendered on this page)
 */

async function dismissReportsTutorialIfPresent(driver) {
  await dismissExperimentListTutorialIfPresent(driver);
}

/** First numeric id from any s-link pointing at /app/reports/:id plus total candidate count. */
async function getFirstReportExperimentMeta(driver) {
  return driver.executeScript(`
    const links = [...document.querySelectorAll('s-link[href*="/app/reports/"]')];
    let id = null;
    for (const el of links) {
      const href = el.getAttribute("href") || "";
      const m = href.match(/\\/app\\/reports\\/(\\d+)/);
      if (m) {
        id = m[1];
        break;
      }
    }
    return { id, candidateCount: links.length };
  `);
}

async function getIframeLocationHref(driver) {
  return driver.executeScript(`return window.location.href || "";`);
}

async function navigateToReport(driver, reportId, segment = null) {
  const qs = segment ? `?segment=${segment}` : "";
  await navigateToAppRoute(driver, `/app/reports/${reportId}${qs}`);
  await switchToAppIframe(driver);
  await waitForAppReady(driver);
}

async function waitForBodyContainsAll(driver, snippets, timeout = 25_000) {
  await driver.wait(async () => {
    const body = await driver.findElement(By.css("body"));
    const text = await getTextContent(driver, body);
    return snippets.every((s) => text.includes(s));
  }, timeout, `Timed out waiting for body to include: ${snippets.join(", ")}`);
}

async function getSegmentButtonVariant(driver, segment) {
  return driver.executeScript(
    `
    const sel = 's-button[href="?segment=' + arguments[0] + '"]';
    const el = document.querySelector(sel);
    return el ? (el.getAttribute("variant") || "") : null;
  `,
    segment,
  );
}

async function hasInAppBreadcrumbLink(driver) {
  return driver.executeScript(`
    return document.querySelector('s-link[href="/app/experiments"]') != null;
  `);
}

async function hasEditButtonHrefForReport(driver, reportId) {
  return driver.executeScript(
    `
    const id = arguments[0];
    const sel = 's-button[href*="/app/experiments/' + id + '"]';
    return document.querySelector(sel) != null;
  `,
    reportId,
  );
}

async function getDetailFieldSnapshot(driver) {
  return driver.executeScript(`
    const bodyText = (document.body?.textContent || "").replace(/\\s+/g, " ").trim();
    const users = bodyText.match(/Users:\\s*([\\d,]+)\\s*\\/\\s*([\\d,]+)/);
    const section = bodyText.match(/Section ID:\\s*([^\\n\\r]+)/);
    const started = bodyText.match(/Started:\\s*([^\\n\\r]+)/);
    return {
      usersLine: users ? users[0] : null,
      sectionIdLine: section ? section[0] : null,
      startedLine: started ? started[0] : null,
    };
  `);
}

async function getVariantTableState(driver) {
  return driver.executeScript(`
    const text = (document.body?.textContent || "").replace(/\\s+/g, " ").trim();
    const hasEmptyState =
      text.includes("No analysis data yet") &&
      text.includes("Start the experiment to begin collecting results");

    const headers = [...document.querySelectorAll("s-table-header")].map((h) =>
      (h.textContent || "").replace(/\\s+/g, " ").trim()
    );
    const hasTableHeaders =
      headers.some((h) => h.includes("Variant Name")) &&
      headers.some((h) => h.includes("Goal Completion Rate")) &&
      headers.some((h) => h.includes("Probability to be Best"));
    const rowCount = document.querySelectorAll("s-table-body s-table-row").length;
    return { hasEmptyState, hasTableHeaders, rowCount };
  `);
}

async function getChartSectionState(driver, heading) {
  return driver.executeScript(
    `
    const wanted = arguments[0];
    const section = document.querySelector('s-section[heading="' + wanted + '"]');
    if (!section) return { exists: false, hasChart: false, hasLoading: false, hasEmpty: false };
    const text = (section.textContent || "").replace(/\\s+/g, " ").trim();
    return {
      exists: true,
      hasChart: section.querySelector(".recharts-wrapper") != null,
      hasLoading: text.includes("Loading chart..."),
      hasEmpty: text.includes("No graph data available for the selected date range."),
    };
  `,
    heading,
  );
}

async function openStatusPopoverAndListOptions(driver, reportId) {
  return driver.executeScript(
    `
    const id = arguments[0];
    const trigger = document.querySelector('s-button[commandfor="status-popover-' + id + '"]');
    if (!trigger) return { opened: false, options: [] };
    trigger.click();
    const pop = document.querySelector('s-popover#status-popover-' + id);
    const labels = pop
      ? [...pop.querySelectorAll("s-button")]
          .map((b) => (b.textContent || "").replace(/\\s+/g, " ").trim())
          .filter(Boolean)
      : [];
    return { opened: !!pop, options: labels };
  `,
    reportId,
  );
}

describe("Report detail — /app/reports/:id", () => {
  let driver;
  /** @type {string | null} */
  let reportId;

  beforeAll(async () => {
    driver = await createDriver();
    await loginToShopifyAdmin(driver);

    await navigateToAppRoute(driver, "/app/reports");
    await switchToAppIframe(driver);
    await waitForAppReady(driver);
    await dismissReportsTutorialIfPresent(driver);

    const firstMeta = await getFirstReportExperimentMeta(driver);
    reportId = firstMeta?.id ?? null;
    if (!reportId) {
      throw new Error(
        `No /app/reports/:id link found on the reports index (s-link candidates: ${firstMeta?.candidateCount ?? 0}). Seed demo data or create an experiment so the table lists at least one row.`,
      );
    }

    await navigateToReport(driver, reportId);
    await waitForBodyContainsAll(driver, [
      "Recommended course of action",
      "Variant Success Rate",
      "Status",
    ]);
  });

  afterAll(async () => {
    await quitDriver(driver);
  });

  it("renders detail shell and key report regions", async () => {
    await waitForBodyContainsAll(driver, [
      "Recommended course of action",
      "Details",
      "Segment:",
      "All",
      "Mobile",
      "Desktop",
      "Variant Success Rate",
      "Probability To Be The Best",
      "Expected Loss",
      "Status",
    ]);
    const href = await getIframeLocationHref(driver);
    expect(href).toContain(`/app/reports/${reportId}`);
  });

  it("breadcrumb and edit controls point to expected routes", async () => {
    const hasBreadcrumb = await hasInAppBreadcrumbLink(driver);
    expect(hasBreadcrumb).toBe(true);

    const hasEditHref = await hasEditButtonHrefForReport(driver, reportId);
    expect(hasEditHref).toBe(true);
  });

  it("key computed detail fields are present and non-empty", async () => {
    await driver.wait(async () => {
      const fields = await getDetailFieldSnapshot(driver);
      if (!fields.usersLine || !fields.sectionIdLine || !fields.startedLine) return false;
      const sectionValue = fields.sectionIdLine.replace("Section ID:", "").trim();
      const startedValue = fields.startedLine.replace("Started:", "").trim();
      return sectionValue.length > 0 && startedValue.length > 0;
    }, 20_000);
  });

  it("variant table renders either populated headers/rows or explicit empty state", async () => {
    await driver.wait(async () => {
      const state = await getVariantTableState(driver);
      const populated = state.hasTableHeaders && state.rowCount > 0;
      return populated || state.hasEmptyState;
    }, 20_000);
  });

  it("each chart section has a deterministic state (chart, loading, or empty)", async () => {
    for (const heading of ["Probability To Be The Best", "Expected Loss"]) {
      const state = await getChartSectionState(driver, heading);
      expect(state.exists).toBe(true);
      const variants = [state.hasChart, state.hasLoading, state.hasEmpty].filter(Boolean);
      expect(variants.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("segment routes are stable and keep report shell rendered", async () => {
    for (const segment of ["mobile", "desktop", "all"]) {
      await navigateToReport(driver, reportId, segment);
      await waitForBodyContainsAll(driver, [
        "Recommended course of action",
        "Variant Success Rate",
      ]);

      const href = await getIframeLocationHref(driver);
      expect(href).toContain(`segment=${segment}`);

      const variant = await getSegmentButtonVariant(driver, segment);
      expect(variant).toBe("primary");
    }
  });

  it("status popover opens and exposes allowed actions without mutation", async () => {
    const statusUi = await openStatusPopoverAndListOptions(driver, reportId);
    expect(statusUi.opened).toBe(true);
    expect(statusUi.options.length).toBeGreaterThanOrEqual(1);
  });

  it("reports index still exposes at least one report link", async () => {
    await navigateToAppRoute(driver, "/app/reports");
    await switchToAppIframe(driver);
    await waitForAppReady(driver);
    const meta = await getFirstReportExperimentMeta(driver);
    expect(meta.candidateCount).toBeGreaterThanOrEqual(1);
    expect(meta.id).not.toBeNull();
    await navigateToReport(driver, reportId, "all");
  });
});