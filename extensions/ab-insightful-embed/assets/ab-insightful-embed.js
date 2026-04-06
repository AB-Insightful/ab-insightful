// The script for controlling which experiments to show will live here.

const urlParams = new URLSearchParams(window.location.search);

// Saves initial launch to the new sessionStorage
// SectionID picker mode persists through page navigation 
// until the session (tab) is closed
if (urlParams.get("ab_insightful_picker") === "true") {
  sessionStorage.setItem("ab_insightful_picker", "true");
}

const isPickerMode = sessionStorage.getItem("ab_insightful_picker") === "true";

if (isPickerMode) {
  initPickerMode(); // initiate custom css on storefront to select sectionID 
} else {
  // Normal execution
  const appConfigBlock = document.getElementById("ab-insightful-config");
  // if app config block not loaded - app will not run
  if (appConfigBlock) {
    const config = JSON.parse(appConfigBlock.textContent);
    const appUrl = config.api_url;
    initializeApp(appUrl);
  } else {
    console.warn("API Url not found - AB Testing will not run");
  }
}

function initPickerMode() {

  let isSelecting = false;
  let isAltDown = false;

  const style = document.createElement("style");
  style.innerHTML = `
    /* Forces crosshair everywhere when active */
    body.ab-insightful-selecting,
    body.ab-insightful-selecting *,
    body.ab-insightful-alt-selecting,
    body.ab-insightful-alt-selecting * {
      cursor: crosshair !important;
    }

    /* Force section visibility */
    body.ab-insightful-selecting [id^="shopify-section-"],
    body.ab-insightful-alt-selecting [id^="shopify-section-"] {
      transition: all 0.2s ease-in-out;
      display: block !important; 
      min-height: 50px !important; 
      visibility: visible !important;
    }
    
    /* Hover highlights */
    body.ab-insightful-selecting [id^="shopify-section-"]:hover,
    body.ab-insightful-alt-selecting [id^="shopify-section-"]:hover {
      outline: 3px solid #005bd3 !important; /* Modern Polaris focus blue */
      outline-offset: -3px;
      background-color: rgba(0, 91, 211, 0.05) !important;
      z-index: 999999;
    }
  `;
  document.head.appendChild(style);

  function setupPickerUI() {
    const ui = document.createElement("div");
    ui.id = "ab-insightful-picker-ui";
    ui.style.cssText = `
      position: fixed; 
      bottom: 24px; 
      right: 24px; 
      z-index: 9999999; 
      background: #ffffff; 
      padding: 16px; 
      border-radius: 8px; 
      box-shadow: 0 0 0 1px rgba(0,0,0,0.05), 0 2px 4px rgba(0,0,0,0.1); /* Polaris shadow */
      font-family: -apple-system, BlinkMacSystemFont, "San Francisco", "Segoe UI", Roboto, "Helvetica Neue", sans-serif; 
      width: 260px;
      color: #202223;
    `;

    // Polaris Typography and Button Styles
    ui.innerHTML = `
      <div style="font-weight: 650; font-size: 14px; margin-bottom: 8px; color: #202223;">
        AB Insightful Picker
      </div>
      <div style="font-size: 13px; color: #6d7175; margin-bottom: 16px; line-height: 1.4;">
        Click below or hold <b>ALT/Option</b> to make a section selection.
      </div>
      <button id="ab-insightful-toggle" style="
        width: 100%; 
        background: #1a1a1a; /* Polaris Primary Button */
        color: #ffffff; 
        border: none; 
        padding: 8px 16px; 
        border-radius: 6px; 
        cursor: pointer; 
        font-weight: 600; 
        font-size: 13px;
        box-shadow: 0 1px 0 rgba(0,0,0,0.15);
        transition: background 0.15s ease, box-shadow 0.15s ease;
      ">
        Enter Select Mode
      </button>
    `;
    document.body.appendChild(ui);

    const toggleBtn = document.getElementById("ab-insightful-toggle");

    // Toggle button logic with Polaris hover/active states
    toggleBtn.addEventListener("mouseover", () => {
      toggleBtn.style.background = isSelecting ? '#b8260b' : '#303030';
    });
    toggleBtn.addEventListener("mouseout", () => {
      toggleBtn.style.background = isSelecting ? '#d82c0d' : '#1a1a1a';
    });

    toggleBtn.addEventListener("click", () => {
      isSelecting = !isSelecting;
      if (isSelecting) {
        document.body.classList.add("ab-insightful-selecting");
        // Polaris Critical Button (Red)
        toggleBtn.style.background = '#d82c0d';
        toggleBtn.innerText = "Exit Select Mode";
      } else {
        document.body.classList.remove("ab-insightful-selecting");
        // Polaris Primary Button (Black)
        toggleBtn.style.background = '#1a1a1a';
        toggleBtn.innerText = "Enter Select Mode";
      }
    });
  }

  // Ensure DOM is ready before appending the UI
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupPickerUI);
  } else {
    setupPickerUI();
  }

  // Hotkey Support (Hold alt/control to temporarily enter selection mode)
  document.addEventListener("keydown", (e) => {
    if (e.altKey && !isAltDown) {
      isAltDown = true;
      document.body.classList.add("ab-insightful-alt-selecting");
    }
  });

  document.addEventListener("keyup", (e) => {
    if (!e.altKey && isAltDown) {
      isAltDown = false;
      document.body.classList.remove("ab-insightful-alt-selecting");
    }
  });

  // Click Interception
  document.addEventListener("click", function (event) {
    // Let normal clicks pass through if we aren't in Select Mode or holding alt/control
    if (!isSelecting && !event.altKey) return;
    
    // Prevent the toggle button itself from triggering a section pick
    if (event.target.closest("#ab-insightful-picker-ui")) return;

    const section = event.target.closest('[id^="shopify-section-"]');
    
    if (section && window.opener) {
      event.preventDefault();
      event.stopPropagation();
      window.opener.postMessage(
        { 
          type: "AB_INSIGHTFUL_SECTION_PICKED", 
          sectionId: section.id 
        }, 
        "*" 
      );
      
      window.close();
    }
  }, true);
}

function initializeApp(appUrl) {
  const deviceType = detectDeviceType();

  fetch(`${appUrl}/api/experiments`, { method: "GET" })
    .then((res) => res.json())
    .then((experiments) => {
      const assignments = migrateOldCookies(getAssignments(), experiments);

      experiments.forEach((experiment) => {
        processExperiment(experiment, assignments, appUrl, deviceType);
      });

      saveAssignments(assignments);
    })
    .catch((err) => {
      console.error("[ab-insightful] Failed to fetch experiments:", err);
    });
}

function processExperiment(experiment, assignments, appUrl, deviceType) {
  // Only relevant if at least one variant section exists on this page
  const variantsOnPage = experiment.variants.filter(
    (v) => v.sectionId && document.getElementById(v.sectionId),
  );
  if (variantsOnPage.length === 0) return;

  const expKey = String(experiment.id);
  let assignedVariant = null;
  let isNew = false;

  // Check for an existing assignment
  if (assignments[expKey] != null) {
    assignedVariant = experiment.variants.find(
      (v) => v.id === assignments[expKey],
    );
    // If the stored variant no longer exists in the experiment, reassign
    if (!assignedVariant) {
      delete assignments[expKey];
    }
  }

  // New assignment via weighted random selection
  if (!assignedVariant) {
    assignedVariant = weightedRandomSelect(experiment.variants);
    isNew = true;
  }

  assignments[expKey] = assignedVariant.id;

  // Show assigned variant section, hide every other variant section
  experiment.variants.forEach((v) => {
    if (!v.sectionId) return;
    const el = document.getElementById(v.sectionId);
    if (!el) return;
    el.style.display = v.id === assignedVariant.id ? "" : "none";
  });

  if (isNew) {
    const userId = getCookie("_shopify_y");
    submitExperimentUser(
      userId,
      experiment.id,
      assignedVariant.name,
      appUrl,
      deviceType,
    );
  }
}

// Pick one variant using cumulative traffic allocation weights.
function weightedRandomSelect(variants) {
  const rand = Math.random();
  let cumulative = 0;
  for (const v of variants) {
    cumulative += v.trafficAllocation;
    if (rand < cumulative) return v;
  }
  return variants[variants.length - 1];
}

// --- Cookie helpers ---

function getAssignments() {
  const raw = getCookie("ab-assignments");
  if (!raw) return {};
  try {
    return JSON.parse(decodeURIComponent(raw));
  } catch {
    return {};
  }
}

function saveAssignments(assignments) {
  const encoded = encodeURIComponent(JSON.stringify(assignments));
  document.cookie = "ab-assignments=" + encoded + "; path=/; max-age=31536000";
}

// Migrate legacy ab-control-ids / ab-variant-ids cookies into the new format
// so returning visitors keep their original assignment.
function migrateOldCookies(assignments, experiments) {
  const oldControl = getCookie("ab-control-ids");
  const oldVariant = getCookie("ab-variant-ids");
  if (!oldControl && !oldVariant) return assignments;

  const expMap = {};
  experiments.forEach((exp) => {
    expMap[String(exp.id)] = exp.variants;
  });

  if (oldControl) {
    oldControl.split(",").forEach((raw) => {
      const id = raw.trim();
      if (!id || assignments[id] != null) return;
      const variants = expMap[id];
      if (!variants) return;
      const control = variants.find((v) => v.isControl);
      if (control) assignments[id] = control.id;
    });
  }

  if (oldVariant) {
    oldVariant.split(",").forEach((raw) => {
      const id = raw.trim();
      if (!id || assignments[id] != null) return;
      const variants = expMap[id];
      if (!variants) return;
      const treatment = variants.find((v) => !v.isControl);
      if (treatment) assignments[id] = treatment.id;
    });
  }

  // Clear legacy cookies
  document.cookie = "ab-control-ids=; path=/; max-age=0";
  document.cookie = "ab-variant-ids=; path=/; max-age=0";

  return assignments;
}

function getCookie(name) {
  const nameEQ = name + "=";
  const ca = document.cookie.split(";");
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === " ") c = c.substring(1);
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length);
  }
  return null;
}

function detectDeviceType() {
  const ua = navigator.userAgent || "";

  if (/ipad|tablet/i.test(ua)) return "tablet";
  if (/mobi|android|iphone|ipod/i.test(ua)) return "mobile";
  return "desktop";
}

async function submitExperimentUser(
  userId,
  experimentId,
  variantName,
  appUrl,
  deviceType,
) {
  const payload = {
    event_type: "experiment_include",
    client_id: userId,
    experiment_id: experimentId,
    variant: variantName,
    device_type: deviceType,
    timestamp: new Date().toISOString(),
  };

  try {
    const res = await fetch(`${appUrl}/api/collect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const body = res.ok ? await res.json().catch(() => null) : null;
    const limitReached =
      body?.result?.limitReached === true;

    if (limitReached) {
      // Experiment at max users; assignment was not persisted. Keep showing
      // the client-assigned variant for consistent UX. Do not retry.
      return;
    }

    if (!res.ok) throw new Error("Server responded with " + res.status);
  } catch (err) {
    console.error(
      "[ab-insightful] Failed to submit experiment inclusion:",
      err,
    );
  }
}
