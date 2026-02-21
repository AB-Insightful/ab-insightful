import { useLoaderData } from "react-router";
import {
  useDateRange,
  formatDateForDisplay,
} from "../contexts/DateRangeContext";
import DateRangePicker from "../components/DateRangePicker";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useState, useEffect, useMemo } from "react";


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

  //loading relevant graphical data for quick reporting metrics
  const {getMostRecentExperiment, getExperimentReportData, getNameOfExpGoal} = await import("../services/experiment.server")
  let latestExperiment = await getMostRecentExperiment();
  //latestExperiment.id = 2001 // debug value to test display of different experiment skews
  const experimentReportData = await getExperimentReportData(latestExperiment.id);
  const expGoalData = await getNameOfExpGoal(latestExperiment.id)
  
  const { getVariants } = await import("../services/variant.server");
  const variants = await getVariants(latestExperiment.id);

  const {getImprovement} = await import("../services/experiment.server");
  const improvementPercent = await getImprovement(latestExperiment.id);
  const {getAnalysis} = await import ("../services/experiment.server");
  const baselineVariantId = latestExperiment.variants?.[0]?.id;
  
  const experimentGoalName = expGoalData.goal?.name ?? "found nothing"
  
  experimentReportData.experimentGoal = experimentGoalName;


  const tableData = await Promise.all(
    variants.map(async (v) => {
      const a = await getAnalysis(latestExperiment.id, v.id);
      if (!a) return null;
      return {
        ...a,
        improvement: improvementPercent,
        variantName: v.name,
        experimentName: latestExperiment.name,
        isBaseline: v.id === baselineVariantId,
        goal: a.goal.name,

      };
    })
  );
  experimentReportData["expId"] = latestExperiment.id

  return {experiment: experimentReportData, tableData};
}

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

  //aquire loader data
  const {experiment, tableData} = useLoaderData()

  const { dateRange } = useDateRange();
  //need to check sorting to ensure this is always baseline
  const baselineName = experiment.variants?.[0]?.id;

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

  // Client-only rendering for recharts (prevents SSR hydration mismatch)
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

  //function for compiling graphical data
    // Rearrange data from experiment to be visualized
    const probabilityDataMap = {};
    const expectedLossDataMap = {};
  
    experiment.analyses.forEach((analysis) => {
      const dateKey = analysis.calculatedWhen.toLocaleDateString("en-US");
      if (!probabilityDataMap[dateKey]) {
        probabilityDataMap[dateKey] = { name: dateKey };
      }
      probabilityDataMap[dateKey][analysis.variant.name] =
        analysis.probabilityOfBeingBest;
      if (!expectedLossDataMap[dateKey]) {
        expectedLossDataMap[dateKey] = { name: dateKey };
      }
      expectedLossDataMap[dateKey][analysis.variant.name] = analysis.expectedLoss;
    });
  
    // Convert map to array
    const probabilityData = Object.values(probabilityDataMap);
    const expectedLossData = Object.values(expectedLossDataMap);
  
    const filteredPData = useMemo(() => {
      return probabilityData
        .filter((item) => {
          // Parse the en-US date string (e.g., "1/6/2026")
          const itemDate = new Date(item.name);
          const startDate = new Date(dateRange.start + "T00:00:00");
          const endDate = new Date(dateRange.end + "T23:59:59");
          return itemDate >= startDate && itemDate <= endDate;
        })
        .sort((a, b) => new Date(a.name) - new Date(b.name));
    }, [probabilityData, dateRange]);
  
    const filteredELData = useMemo(() => {
      return expectedLossData
        .filter((item) => {
          const itemDate = new Date(item.name);
          const startDate = new Date(dateRange.start + "T00:00:00");
          const endDate = new Date(dateRange.end + "T23:59:59");
          return itemDate >= startDate && itemDate <= endDate;
        })
        .sort((a, b) => new Date(a.name) - new Date(b.name));
    }, [expectedLossData, dateRange]);
    
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
      
      <s-grid gridTemplateColumns="3fr 1fr"  gap="base">
        <s-grid-item>
      <s-section><s-box><s-heading>Latest Experiment Results</s-heading>
      {/*graphical section */ }
      <div style={{ marginBottom: "16px", marginTop: "16px" }}>
              <DateRangePicker />
              {dateRange && (
                <s-text tone="subdued">
                  Viewing data from {formatDateForDisplay(dateRange.start)} to{" "}
                  {formatDateForDisplay(dateRange.end)}
                </s-text>
              )}              
        </div>
      <s-section heading="Probability To Be The Best">
              {isClient ? (
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={filteredPData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis
                      width={80}
                      tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
                      label={{
                        value: "Probability to be the best (%)",
                        angle: -90,
                        position: "insideLeft",
                        style: { textAnchor: "middle" },
                      }}
                    />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey={experiment.variants[0].name}
                      stroke="#8884d8"
                      activeDot={{ r: 8 }}
                    />
                    <Line
                      type="monotone"
                      dataKey={experiment.variants[1].name}
                      stroke="#82ca9d"
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ width: 700, height: 400 }}>Loading chart...</div>
              )}
            {/*This current button link should theoretically work but cannot be tested since not all of these graphs contain graphing data (causes app crash) and appropriate error handling */}
            {/* Good candidate for unit/integration test */}
            {/* recent experiment additional info section */}
            
            </s-section>
            </s-box>
            <s-table>
              <s-table-header-row>
                <s-table-header listslot="primary">Name</s-table-header>
                <s-table-header listSlot="secondary">Status</s-table-header>
                <s-table-header listSlot="labeled" format="numeric">Goal Completion Rate</s-table-header>
                <s-table-header listSlot="labeled" format="numeric">Improvement (%)</s-table-header>
                <s-table-header listSlot="labeled" format="numeric">Probability to be the best</s-table-header>                
              </s-table-header-row>
                <s-table-body>
                {tableData.map((row, index) => (
                  <s-table-row key={row.variantId ?? row.variantName}>
                    <s-table-cell>{row.variantName}</s-table-cell>

                    <s-table-cell>{experiment.status}</s-table-cell>

                    {/* change this to whatever field your analysis row actually has */}
                    <s-table-cell>{row.totalConversions + "/" + row.totalUsers ?? "N/A"}</s-table-cell>

                    <s-table-cell>
                      {index === 0 ? "Baseline" : row.improvement.toFixed(2) != null ? `${row.improvement.toFixed(2)}%` : "N/A"}
                    </s-table-cell>

                    <s-table-cell>
                      {row.probabilityOfBeingBest != null
                        ? `${(row.probabilityOfBeingBest * 100).toFixed(1)}%`
                        : "N/A"}
                    </s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
              </s-table>
             <s-button href={"/app/reports/" + experiment.expId}>More Info for {experiment.name}</s-button></s-section>
        {/*Additional aside details for latest active experiment */}
        </s-grid-item>
        <s-grid-item>
          <s-section heading="Experiment Details" padding="base">
            <s-stack gap="small-200">
              <s-heading>
                {experiment.name}
              </s-heading>
              <s-stack direction="inline" gap="small-200" alignItems="center">
                <s-text type="strong">Goal: </s-text>
                <s-badge tone="info" color="neutral">
                  {experiment.experimentGoal}
                </s-badge>
                <s-icon type="target" size="small" color="subdued" />
              </s-stack>
              <s-stack direction="inline" gap="small-200" alignItems="center">
                <s-text color="subdued">Started {experiment.createdAt.toLocaleString()}</s-text>
              </s-stack>
            </s-stack>
          </s-section>
        </s-grid-item>
      </s-grid>
      <s-box></s-box>
      {/* Begin quick links */}
      {/*added marginTop modifier to div style to ensure gap between sections */}
      <div style={{ display: "flex", flexDirection: "column", marginTop: "16px",}}>
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
