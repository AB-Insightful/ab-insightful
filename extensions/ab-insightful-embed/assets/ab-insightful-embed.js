// The script for controlling which experiments to show will live here.

const urlParams = new URLSearchParams(window.location.search);
const isPickerMode = urlParams.get("ab_insightful_picker") === "true";

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
    body.ab-insightful-selecting [id^="shopify-section-"],
    body.ab-insightful-alt-selecting [id^="shopify-section-"] {
      transition: all 0.2s ease-in-out;
      display: block !important; 
      min-height: 50px !important; 
      visibility: visible !important;
    }
    
    body.ab-insightful-selecting [id^="shopify-section-"]:hover,
    body.ab-insightful-alt-selecting [id^="shopify-section-"]:hover {
      outline: 4px dashed #008060 !important;
      outline-offset: -4px;
      cursor: crosshair !important;
      background-color: rgba(0, 128, 96, 0.1) !important;
      z-index: 999999;
    }
  `;
  document.head.appendChild(style);

  function setupPickerUI() {
    const ui = document.createElement("div");
    ui.id = "ab-insightful-picker-ui";
    ui.style.cssText = "position:fixed; bottom:20px; right:20px; z-index:9999999; background:#ffffff; padding:16px; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.15); font-family:-apple-system, BlinkMacSystemFont, 'San Francisco', Roboto, 'Segoe UI', 'Helvetica Neue', sans-serif; border:1px solid #e1e3e5; width: 250px;";
    
    ui.innerHTML = `
      <div style="font-weight:600; font-size:14px; margin-bottom:8px; color:#202223;">AB Insightful Picker</div>
      <div style="font-size:12px; color:#6d7175; margin-bottom:12px; line-height:1.4;">Browse the store normally. Click below or hold <b>ALT/Option</b> to select a section.</div>
      <button id="ab-insightful-toggle" style="width:100%; background:#008060; color:#ffffff; border:none; padding:8px 12px; border-radius:4px; cursor:pointer; font-weight:600; transition: background 0.2s ease;">
        Enter Select Mode
      </button>
    `;
    document.body.appendChild(ui);

    const toggleBtn = document.getElementById("ab-insightful-toggle");

    // Toggle button logic
    toggleBtn.addEventListener("click", () => {
      isSelecting = !isSelecting;
      if (isSelecting) {
        documennt.body.classList.add("ab-insightful-selecting");
        toggleBtn.style.background = '#d82c0d';
        toggleBtn.innerText = "Exit Select Mode";
      } else {
        document.body.classList.remove("ab-insightful-selecting");
        toggleBtn.style.background = '#008060';
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

  // Hotkey Support (Hold ALT to temporarily enter selection mode)
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
