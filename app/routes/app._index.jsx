//suppress react hydration warnings
//known issue between polaris web components and React hydration
if (typeof window !== "undefined") {
  const originalError = console.error;
  console.error = (...args) => {
    if (
      typeof args[0] === "string" &&
      args[0].includes("Extra attributes from the server")
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
}

import { useState, useEffect } from "react";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
// TODO in the /app/services, add a extension.server.js that will do this "register" part.
export const loader = async ({ request }) => {
  await authenticate.admin(request);
  const { updateWebPixel } = await import("../services/extension.server");
  await updateWebPixel({ request });

  // Push app URL to metafield -- Shouldn't be required for production
  const { updateAppUrlMetafield } = await import(
    "../services/extension.server"
  );
  await updateAppUrlMetafield({ request });

  return null;
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("action");

  // Setup Guide -> Enable Tracking
  if (actionType === "enableTracking") {
    const { registerWebPixel } = await import("../services/extension.server");
    const response = await registerWebPixel({ request });

    return response.json();
  }
};

export default function Index() {
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  // State for setup guide
  const [visible, setVisible] = useState({
    setupGuide: true,
  });
  const [expanded, setExpanded] = useState({
    setupGuide: true,
    step1: false,
  });
  const [progress, setProgress] = useState(0);
  const [trackingStatus, setTrackingStatus] = useState(null);

  // Function for enabling tracking
  const enableTracking = async () => {
    await fetcher.submit({ action: "enableTracking" }, { method: "POST" });
  };

  // Update status of Setup guide based on responses
  useEffect(() => {
    if (fetcher.data && fetcher.state === "idle") {
      const actionType = fetcher.data.action;
      // Determine which action has an update
      if (actionType === "enableTracking") {
        setTrackingStatus(fetcher.data.message);
      }
    }
  }, [fetcher.data, fetcher.state]);

  // Button list to navigate to different pages
  return (
    <s-page heading="Welcome to AB Insightful">
      {/* Header Buttons */}
      <s-button
        slot="primary-action"
        variant="primary"
        href="/app/experiments/new"
      >
        New Experiment
      </s-button>
      <s-button slot="secondary-actions" href="/app/reports">
        Reports
      </s-button>
      <s-button slot="secondary-actions" href="/app/experiments">
        Manage Experiments
      </s-button>

      {/* Begin Setup guide */}
      {visible.setupGuide && (
        <s-section>
          <s-grid gap="small">
            {/* Header */}
            <s-grid gap="small-200">
              <s-grid
                gridTemplateColumns="1fr auto auto"
                gap="small-300"
                alignItems="center"
              >
                <s-heading>Setup Guide</s-heading>
                {/* Critical steps need to come first. Once they are completed, 
                the user may choose to dismiss the setup guide */}
                {progress >= 1 && (
                  <s-button
                    accessibilityLabel="Dismiss Guide"
                    onClick={() =>
                      setVisible({ ...visible, setupGuide: false })
                    }
                    variant="tertiary"
                    tone="neutral"
                    icon="x"
                  ></s-button>
                )}

                <s-button
                  accessibilityLabel="Toggle setup guide"
                  onClick={(e) =>
                    setExpanded({
                      ...expanded,
                      setupGuide: !expanded.setupGuide,
                    })
                  }
                  variant="tertiary"
                  tone="neutral"
                  icon={expanded.setupGuide ? "chevron-up" : "chevron-down"}
                ></s-button>
              </s-grid>
              <s-paragraph>
                Please complete the following steps to begin using AB
                Insightful!
              </s-paragraph>
              <s-paragraph color="subdued">
                {progress} out of 1 steps completed
              </s-paragraph>
            </s-grid>
            {/* Steps Container */}
            <s-box
              borderRadius="base"
              border="base"
              background="base"
              display={expanded.setupGuide ? "auto" : "none"}
            >
              {/* Step 1 */}
              <s-box>
                <s-grid
                  gridTemplateColumns="1fr auto"
                  gap="base"
                  padding="small"
                >
                  <s-checkbox
                    label="Enable on-site tracking"
                    onInput={(e) =>
                      setProgress(
                        e.currentTarget.checked ? progress + 1 : progress - 1,
                      )
                    }
                  ></s-checkbox>
                  <s-button
                    onClick={(e) => {
                      setExpanded({ ...expanded, step1: !expanded.step1 });
                    }}
                    accessibilityLabel="Toggle step 1 details"
                    variant="tertiary"
                    icon={expanded.step1 ? "chevron-up" : "chevron-down"}
                  ></s-button>
                </s-grid>
                <s-box
                  padding="small"
                  paddingBlockStart="none"
                  display={expanded.step1 ? "auto" : "none"}
                >
                  <s-box
                    padding="base"
                    background="subdued"
                    borderRadius="base"
                  >
                    <s-grid
                      gridTemplateColumns="1fr auto"
                      gap="base"
                      alignItems="center"
                    >
                      <s-grid gap="small-200">
                        <s-paragraph>
                          Enable on-site tracking so AB Insightful can collect
                          information about experiment goal completions.
                        </s-paragraph>
                        <s-button variant="primary" onClick={enableTracking}>
                          Enable Tracking
                        </s-button>
                        {trackingStatus && <s-text>{trackingStatus}</s-text>}
                      </s-grid>
                    </s-grid>
                  </s-box>
                </s-box>
              </s-box>
              {/* Step 2 */}
              <s-divider />
              {/* Add additional steps here... */}
            </s-box>
          </s-grid>
        </s-section>
      )}
      {/* End Setup guide */}

      {/* Begin quick links */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        <s-clickable
          border="base"
          padding="base"
          background="subdued"
          borderRadius="base"
          href="/app/experiments"
          maxInlineSize="650px"
          maxBlockSize="52px"
        >
          <s-heading>View Experiments</s-heading>
        </s-clickable>
        <s-clickable
          border="base"
          padding="base"
          background="subdued"
          borderRadius="base"
          href="/app/experiments/new"
          maxInlineSize="650px"
          maxBlockSize="52px"
        >
          <s-heading>Create New Experiment</s-heading>
        </s-clickable>
        <s-clickable
          border="base"
          padding="base"
          background="subdued"
          borderRadius="base"
          href="/app/reports"
          maxInlineSize="650px"
          maxBlockSize="52px"
        >
          <s-heading>Reports</s-heading>
        </s-clickable>
        <s-clickable
          border="base"
          padding="base"
          background="subdued"
          borderRadius="base"
          href="/app/settings"
          maxInlineSize="650px"
          maxBlockSize="52px"
        >
          <s-heading>Settings</s-heading>
        </s-clickable>
        <s-clickable
          border="base"
          padding="base"
          background="subdued"
          borderRadius="base"
          href="/app/help"
          maxInlineSize="650px"
          maxBlockSize="52px"
        >
          <s-heading>Help</s-heading>
        </s-clickable>
      </div>
      {/* End Quick Links */}
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
