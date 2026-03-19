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
  const style = document.createElement("style");
  style.innerHTML = `
    /* Force visibility of all sections during picking */
    [id^="shopify-section-"] {
      transition: all 0.2s ease-in-out;
      display: block !important; /* Overrides theme-level hiding */
      min-height: 50px !important; 
      visibility: visible !important;
    }
    [id^="shopify-section-"]:hover {
      outline: 4px dashed #008060 !important;
      outline-offset: -4px;
      cursor: crosshair !important;
      background-color: rgba(0, 128, 96, 0.1) !important;
      z-index: 999999;
    }
  `;
  document.head.appendChild(style);

  document.addEventListener("click", function (event) {
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
  fetch(`${appUrl}/api/experiments`, { method: "GET" })
    .then((res) => res.json())
    .then((experiments) => {
      const assignments = migrateOldCookies(getAssignments(), experiments);

      experiments.forEach((experiment) => {
        processExperiment(experiment, assignments, appUrl);
      });

      saveAssignments(assignments);
    })
    .catch((err) => {
      console.error("[ab-insightful] Failed to fetch experiments:", err);
    });
}

function processExperiment(experiment, assignments, appUrl) {
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
    submitExperimentUser(userId, experiment.id, assignedVariant.name, appUrl);
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

async function submitExperimentUser(userId, experimentId, variantName, appUrl) {
  const payload = {
    event_type: "experiment_include",
    client_id: userId,
    experiment_id: experimentId,
    variant: variantName,
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
