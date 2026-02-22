// The script for controlling which experiments to show will live here.

const appConfigBlock = document.getElementById("ab-insightful-config");
// if app config block not loaded - app will not run
if (appConfigBlock) {
  const config = JSON.parse(appConfigBlock.textContent);
  const appUrl = config.api_url;
  initializeApp(appUrl);
} else {
  console.warn("API Url not found - AB Testing will not run");
}

function initializeApp(appUrl) {
  const experimentsAPIUrl = `${appUrl}/api/experiments`;
  let experiment_ids = {};
  fetch(experimentsAPIUrl, {
    method: "GET",
  })
    .then((res) => {
      return res.json();
    })
    .then((data) => {
      console.log("[ab-insightful-embed]: list of active experiments: ", data);
      data.forEach((experiment) => {
        const match = document.getElementById(experiment.sectionId);
        if (match) {
          console.log(
            `[ab-insightful-embed] Match! ID: ${experiment.sectionId} Element: ${match}`,
          );
          invokeExperiment(
            experiment.id,
            experiment.trafficSplit,
            match,
            appUrl,
          );
        }
      });
    })
    .catch((error) => {
      console.log(error);
    });
}

// Function to decide whether to activate an experiment for the current client given an active experiment
function invokeExperiment(id, chanceToShow, element, appUrl) {
  // Two cookies - one for experiments involved in control, one for involved in variants
  // Both are comma separated lists of id's
  const involvedControlExperiments = getCookie("ab-control-ids");
  const involvedVariantExperiments = getCookie("ab-variant-ids");
  // Check if this user is already in the experiment as a control
  if (involvedControlExperiments) {
    const expids = involvedControlExperiments.split(",");
    if (expids.includes(String(id))) {
      return;
    }
  }

  // Check if this user is already in the experiment as a variant
  if (involvedVariantExperiments) {
    const expids = involvedVariantExperiments.split(",");
    if (expids.includes(String(id))) {
      element.style.display = "none";
      return;
    }
  }

  // Base case: not in control or variant list - add to experiment
  const chance = Number(chanceToShow);
  if (Math.random() <= chance) {
    // Add to variant experiment
    element.style.display = "none";
    document.cookie =
      "ab-variant-ids=" +
      (involvedVariantExperiments ? involvedVariantExperiments + "," : "") +
      id +
      "; path=/";

    // Setup data to send to server to notify of new experiment user
    const user_id = getCookie("_shopify_y");
    submitExperimentUser(user_id, id, "Variant A", appUrl);
  } else {
    // Add to control group
    document.cookie =
      "ab-control-ids=" +
      (involvedControlExperiments ? involvedControlExperiments + "," : "") +
      id +
      "; path=/";
    // Include user in Control on server
    const user_id = getCookie("_shopify_y");
    submitExperimentUser(user_id, id, "Control", appUrl);
  }
}

function getCookie(name) {
  const nameEQ = name + "=";
  const ca = document.cookie.split(";");
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === " ") {
      c = c.substring(1, c.length);
    }
    if (c.indexOf(nameEQ) === 0) {
      return c.substring(nameEQ.length, c.length);
    }
  }
  return null;
}

async function submitExperimentUser(user_id, experiment_id, variant, appUrl) {
  const collectUrl = `${appUrl}/api/collect`;
  const payload = {
    event_type: "experiment_include",
    user_id: user_id,
    experiment_id: experiment_id,
    variant: variant,
    timestamp: new Date().toISOString(),
  };
  fetch(collectUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json", // Indicate that the body is JSON
    },
    body: JSON.stringify(payload),
  })
    .then((res) => {
      if (!res.ok) {
        throw new Error("User not attributed to experiment");
      }
    })
    .catch((error) => {
      console.log(error);
    });
}
