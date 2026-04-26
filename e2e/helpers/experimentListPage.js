import { By } from "selenium-webdriver";
import { until } from "selenium-webdriver";
import { navigateToApp } from "./auth.js";
import { switchToAppIframe, switchToParent, waitForAppReady } from "./iframe.js";
import { getTextContent, jsClick } from "./shadow.js";
import { sleep } from "./waits.js";

/**
 * Load app home in the iframe (caller should already be logged in).
 */
export async function openAppHomeInIframe(driver) {
  await navigateToApp(driver);
  await switchToAppIframe(driver);
  await waitForAppReady(driver);
}

/**
 * Dismiss the first-time experiment list tour modal if it is shown.
 */
export async function dismissExperimentListTutorialIfPresent(driver) {
  await sleep(500);
  const clicked = await driver.executeScript(`
    const buttons = document.querySelectorAll("s-button");
    for (const b of buttons) {
      const t = (b.textContent || "").trim();
      if (t.includes("Understood")) {
        b.click();
        return true;
      }
    }
    return false;
  `);
  if (clicked) await sleep(1500);
}

/**
 * From app home, open the Experiments list (s-button or s-link to /app/experiments, not /new).
 */
export async function clickNavigateToExperimentList(driver) {
  const navigated = await driver.executeScript(`
    const candidates = document.querySelectorAll("s-button[href], s-link[href]");
    for (const el of candidates) {
      const href = (el.getAttribute("href") || "").trim();
      if (href === "/app/experiments" || href.endsWith("/app/experiments")) {
        el.click();
        return true;
      }
    }
    return false;
  `);
  if (!navigated) {
    throw new Error(
      "Could not find Experiments navigation control (expected s-button or s-link href=/app/experiments).",
    );
  }
  await sleep(6000);
  await waitForAppReady(driver);
  await waitForExperimentListOrEmpty(driver);
}

export async function waitForExperimentListOrEmpty(driver, timeout = 45_000) {
  await driver.wait(async () => {
    const body = await driver.findElement(By.css("body"));
    const text = await getTextContent(driver, body);
    return (
      text.includes("Experiment Management") ||
      text.includes("Experiment List") ||
      text.includes("Your experiments will show here")
    );
  }, timeout, "Timed out waiting for experiments list UI");
}

export async function waitForBodyContains(driver, substring, timeout = 30_000) {
  await driver.wait(async () => {
    const body = await driver.findElement(By.css("body"));
    const text = await getTextContent(driver, body);
    return text.includes(substring);
  }, timeout, `Timed out waiting for body to contain: ${substring}`);
}

/**
 * Primary "Create Experiment" on the list page (not empty-state duplicate).
 */
export async function clickCreateExperimentFromListPage(driver) {
  const clicked = await driver.executeScript(`
    for (const el of document.querySelectorAll("s-button")) {
      const href = (el.getAttribute("href") || "").trim();
      const t = (el.textContent || "").trim();
      if (href.includes("/app/experiments/new") && t.includes("Create Experiment")) {
        el.click();
        return true;
      }
    }
    return false;
  `);
  if (!clicked) {
    throw new Error('Could not find "Create Experiment" button on experiments list.');
  }
  await sleep(6000);
  await waitForAppReady(driver);
}

/**
 * Click the first experiment name link (s-link to /app/reports/:id).
 */
export async function clickFirstExperimentNameLink(driver) {
  const href = await driver.executeScript(`
    const link = document.querySelector('s-link[href*="/app/reports/"]');
    return link ? link.getAttribute("href") : null;
  `);

  if (!href) {
    throw new Error("No experiment name link (s-link to /app/reports/) found.");
  }

  await driver.executeScript(`
    const link = document.querySelector('s-link[href*="/app/reports/"]');
    if (link) link.click();
  `);

  await sleep(6000);

  // App Bridge navigation can replace/reload the iframe, so reset to parent first.
  await switchToParent(driver);

  await driver.wait(async () => {
    const url = await driver.getCurrentUrl();
    return url.includes("/app/reports/");
  }, 45_000, "Timed out waiting for report route after clicking experiment name");

  await switchToAppIframe(driver);
  await waitForAppReady(driver, 45_000);
}

/**
 * Open the row kebab menu for the first s-table-row whose text matches all tokens.
 */
export async function openRowMenuFirstDataRow(driver) {
  const popoverId = await driver.executeScript(`
    function dataRows() {
      const fromBody = document.querySelectorAll("s-table-body s-table-row");
      if (fromBody.length) return fromBody;
      return [...document.querySelectorAll("s-table-row")].filter((row) =>
        row.querySelector('s-button[icon="horizontal-dots"]'),
      );
    }
    const rows = dataRows();
    if (!rows.length) return null;
    const dots = rows[0].querySelector('s-button[icon="horizontal-dots"]');
    if (!dots) return null;
    const popoverId = dots.getAttribute("commandFor");
    dots.click();
    return popoverId || null;
  `);
  if (!popoverId) throw new Error("No experiment data rows with a row actions menu.");
  await sleep(800);
  return popoverId;
}

export async function openRowMenuForRowContaining(driver, ...textTokens) {
  const popoverId = await driver.executeScript(
    `
    const tokens = arguments[0];
    function dataRows() {
      const fromBody = document.querySelectorAll("s-table-body s-table-row");
      if (fromBody.length) return fromBody;
      return [...document.querySelectorAll("s-table-row")].filter((row) =>
        row.querySelector('s-button[icon="horizontal-dots"]'),
      );
    }
    for (const row of dataRows()) {
      const t = row.textContent || "";
      if (tokens.every((tok) => t.includes(tok))) {
        const dots = row.querySelector('s-button[icon="horizontal-dots"]');
        if (dots) {
          const popoverId = dots.getAttribute("commandFor");
          dots.click();
          return popoverId || null;
        }
      }
    }
    return null;
    `,
    textTokens,
  );
  if (!popoverId) {
    throw new Error(`No table row found containing: ${textTokens.join(", ")}`);
  }
  await sleep(800);
  return popoverId;
}

/**
 * Click a menu / popover button by exact visible label (e.g. "Rename", "Start").
 */
export async function clickButtonWithExactLabel(driver, label, popoverId) {
  const clicked = await driver.executeScript(
    `
    const wanted = arguments[0];
    const id = arguments[1];
    const pop = id ? document.getElementById(id) : null;
    if (!pop) return false;
    const buttons = pop.querySelectorAll("s-button");
    for (const b of buttons) {
      const t = (b.textContent || "").trim();
      if (t === wanted) {
        b.click();
        return true;
      }
    }
    return false;
    `,
    label,
    popoverId,
  );
  if (!clicked) throw new Error(`No popover button with label "${label}"`);
  await sleep(500);
}

export async function getPopoverMenuLabels(driver, popoverId) {
  return driver.executeScript(
    `
    const id = arguments[0];
    const pop = id ? document.getElementById(id) : null;
    if (!pop) return [];
    const labels = [];
    for (const b of pop.querySelectorAll("s-button")) {
      const t = (b.textContent || "").trim();
      if (t && t !== "...") labels.push(t);
    }
    return labels;
    `,
    popoverId,
  );
}

/**
 * Labels on s-buttons inside the first popover that looks visible (kebab menu).
 */
export async function getVisiblePopoverMenuLabels(driver) {
  return driver.executeScript(`
    for (const pop of document.querySelectorAll("s-popover")) {
      const cs = window.getComputedStyle(pop);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      const r = pop.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      const labels = [];
      for (const b of pop.querySelectorAll("s-button")) {
        const t = (b.textContent || "").trim();
        if (t && t !== "...") labels.push(t);
      }
      if (labels.length) return labels;
    }
    return [];
  `);
}

export async function cancelInlineRename(driver) {
  const cancelled = await driver.executeScript(`
    for (const b of document.querySelectorAll("s-button")) {
      const al =
        b.getAttribute("accessibilitylabel") ||
        b.getAttribute("accessibilityLabel") ||
        b.accessibilityLabel ||
        "";
      if (String(al).toLowerCase() === "cancel rename") {
        b.click();
        return true;
      }
    }
    return false;
  `);
  if (cancelled) await sleep(500);
}

/**
 * Read the experiment name from the first s-link in a row matching tokens (before opening menu).
 */
export async function getExperimentNameFromRowContaining(driver, ...textTokens) {
  return driver.executeScript(
    `
    const tokens = arguments[0];
    function dataRows() {
      const fromBody = document.querySelectorAll("s-table-body s-table-row");
      if (fromBody.length) return fromBody;
      return [...document.querySelectorAll("s-table-row")].filter((row) =>
        row.querySelector('s-button[icon="horizontal-dots"]'),
      );
    }
    for (const row of dataRows()) {
      const t = row.textContent || "";
      if (tokens.every((tok) => t.includes(tok))) {
        const link = row.querySelector('s-link[href*="/app/reports/"]');
        if (link) return (link.textContent || "").trim();
      }
    }
    return null;
    `,
    textTokens,
  );
}

/**
 * Click "Filter By" then a filter option button inside the activity menu.
 */
export async function selectFilterByOption(driver, optionLabel) {
  const filterBtn = await driver.findElement(
    By.xpath("//s-button[contains(normalize-space(.),'Filter By')]"),
  );
  await jsClick(driver, filterBtn);
  await sleep(600);

  const option = await driver.wait(
    until.elementLocated(
      By.xpath(`//s-menu[@id='activity-filter']//s-button[normalize-space(.)='${optionLabel}']`),
    ),
    15_000,
  );
  await jsClick(driver, option);
  await sleep(2500);
}

/**
 * Returns text content of each data row in the experiments table (tbody rows only).
 */
export async function getDataRowTexts(driver) {
  return driver.executeScript(`
    const out = [];
    let rows = document.querySelectorAll("s-table-body s-table-row");
    if (!rows.length) {
      rows = [...document.querySelectorAll("s-table-row")].filter((row) =>
        row.querySelector('s-button[icon="horizontal-dots"]'),
      );
    }
    for (const row of rows) {
      out.push((row.textContent || "").replace(/\\s+/g, " ").trim());
    }
    return out;
  `);
}

export async function waitForRowContaining(driver, timeout, ...tokens) {
  await driver.wait(async () => {
    const rows = await getDataRowTexts(driver);
    return rows.some((t) => tokens.every((tok) => t.includes(tok)));
  }, timeout, `Timed out waiting for a table row containing: ${tokens.join(", ")}`);
}

/**
 * Labels on s-buttons inside the first popover that looks visible (kebab menu).
 */
