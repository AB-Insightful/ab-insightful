// Report page for an individual experiment

import { useState, useEffect, useMemo, useRef } from "react";
import { useFetcher, useLoaderData, useRevalidator } from "react-router";
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
  ReferenceLine
} from "recharts";
import { ExperimentStatus } from "../utils/experimentConstants.js";
import { isLockedStatus, allowedStatusIntents } from "./policies/experimentPolicy";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request, params }) => {
  await authenticate.admin(request);

  const formData = await request.formData();
  const experimentId = parseInt(params.id, 10);
  const intent = formData.get("intent");

  if (!experimentId || Number.isNaN(experimentId)) {
    return { ok: false, error: "Invalid experiment id." };
  }

  const existing = await db.experiment.findUnique({ where: { id: experimentId } });
  if (!existing) return { ok: false, error: "Experiment not found." };

  const allowed = allowedStatusIntents(existing.status);
  if (intent && !allowed.has(intent)) {
    return { ok: false, error: "Status change not allowed for this experiment." };
  }

  const {
    pauseExperiment,
    resumeExperiment,
    endExperiment,
    startExperiment,
    deleteExperiment,
    archiveExperiment,
  } = await import("../services/experiment.server");

  try {
    switch (intent) {
      case "start":
        await startExperiment(experimentId);
        return { ok: true, action: ExperimentStatus.active };
      case "pause":
        await pauseExperiment(experimentId);
        return { ok: true, action: ExperimentStatus.paused };
      case "resume":
        await resumeExperiment(experimentId);
        return { ok: true, action: ExperimentStatus.active };
      case "end":
        await endExperiment(experimentId);
        return { ok: true, action: ExperimentStatus.completed };
      case "archive":
        await archiveExperiment(experimentId);
        return { ok: true, action: ExperimentStatus.archived };
      case "delete":
        await deleteExperiment(experimentId);
        return { ok: true, action: "deleteExperiment" };
      default:
        return { ok: false, error: "Unknown intent." };
    }
  } catch (e) {
    console.error("[REPORT][STATUS ACTION FAIL]", e);
    return { ok: false, error: "Failed to update status." };
  }
};

// Server-side loader. params is for the id
export async function loader({ params, request }) {
  // Parse the experiment ID from parameters
  const experimentId = parseInt(params.id);
  const url = new URL(request.url);
  const deviceSegment = url.searchParams.get("segment") ?? "all";

  // Validate experiment ID
  if (!experimentId || isNaN(experimentId)) {
    return { experiment: null };
  }

  // Lookup experiment data
  const { getExperimentReportData } = await import(
    "../services/experiment.server"
  );
  console.log("QUERY SEGMENT:", deviceSegment);
  const experimentReportData = await getExperimentReportData(experimentId, deviceSegment);

  //additional loader data
  if (!Number.isInteger(experimentId)) throw new Response("Invalid id", {status: 400}); //basic safety check for valid exp id

  const { getVariants } = await import("../services/variant.server");
  const variants = await getVariants(experimentId);
  const { getAnalysis } = await import("../services/experiment.server");
  
  const {getExperimentById} = await import("../services/experiment.server");
  const experimentInfo = await getExperimentById(experimentId);

  if (!experimentInfo) {
    throw new Response("Experiment not found", {status: 404 });
  }

  const experimentWithProject = await db.experiment.findUnique({
    where: { id: experimentId },
    include: { project: { select: { maxUsersPerExperiment: true } } },
  });
  const effectiveMax =
    experimentWithProject?.maxUsers ??
    experimentWithProject?.project?.maxUsersPerExperiment ??
    10000;
  const userCount = await db.allocation.count({
    where: { experimentId },
  });

  const {getImprovement} = await import("../services/experiment.server");
  const improvementPercent = await getImprovement(experimentId, deviceSegment);

  //improves performance by performing queries synchronized, then wait for all of queries to finish. 
  const results = await Promise.all(
    variants.map(async (v) => {
      const a = await getAnalysis(experimentId, v.id, deviceSegment);
      if (!a) return null;
      return {
        ...a,
        improvement: improvementPercent,
        variantName: v.name,
        experimentName: experimentInfo.name,

      };
    })
  );

  // dumps any null data before returning 
  const analysis = results.filter(Boolean);

  const mobileCount = await db.analysis.count({
  where: { experimentId: 9103, deviceSegment: "mobile" },
  });

  const desktopCount = await db.analysis.count({
    where: { experimentId: 9103, deviceSegment: "desktop" },
  });

  const allCount = await db.analysis.count({
    where: { experimentId: 9103, deviceSegment: "all" },
  });

  console.log("[REPORT] experimentId:", experimentId);
  console.log("[REPORT] deviceSegment:", deviceSegment);
  console.log("[REPORT] experimentReportData analyses:", experimentReportData?.analyses?.length ?? 0);
  console.log("[REPORT] table analysis rows:", analysis.length);
  console.log("DATABASE_URL:", process.env.DATABASE_URL);
  console.log("[DB COUNTS]", { allCount, mobileCount, desktopCount });
  return { experiment:{ 
    ...experimentReportData,
    status: experimentInfo.status,
    startDate: experimentInfo.startDate,
    userCount,
    effectiveMax,
  },
  analysis,
  deviceSegment,
};
}

export default function Report() {
  // Load report information
  const { experiment, analysis, deviceSegment } = useLoaderData();
  const safeAnalysis = (analysis ?? []).filter(Boolean);

  //status manager refresher
  const fetcher = useFetcher();
  const revalidator = useRevalidator();
  const status = experiment?.status;

  //locks edit button based on status of experiment
  const isLocked = status === ExperimentStatus.completed || status === ExperimentStatus.archived;

  const statusIntents = allowedStatusIntents(status);
  const isArchived = status === ExperimentStatus.archived;
  const lastProcessedJson = useRef(null);

  useEffect(() => {
    const currentDataString = JSON.stringify(fetcher.data);
    
    // Only run if the data is new, exists, and the fetcher is finished
    if (
      fetcher.state === "idle" && 
      fetcher.data?.ok && 
      lastProcessedJson.current !== currentDataString
    ) {
      lastProcessedJson.current = currentDataString;

      if (fetcher.data.action === "deleteExperiment") {
        window.location.href = "/app/experiments";
        return;
      }

      revalidator.revalidate();
    }
  }, [fetcher.state, fetcher.data, revalidator]);

  const renderStatusBadge = (status) => {
    if (status === ExperimentStatus.active)
      return <s-badge tone="info" icon="gauge">Active</s-badge>;
    if (status === ExperimentStatus.paused)
      return <s-badge tone="caution" icon="pause-circle">Paused</s-badge>;
    if (status === ExperimentStatus.completed)
      return <s-badge tone="success" icon="check">Completed</s-badge>;
    if (status === ExperimentStatus.archived)
      return <s-badge tone="warning" icon="order">Archived</s-badge>;
    return <s-badge icon="draft-orders">Draft</s-badge>;
  };

  // Human readable metrics helper
  const formatPercent = (val) => {
    if (val === null || val === undefined) return "-";
    return ( val * 100 ).toFixed(2)+"%";
  }
  // Building the recommendation payload
  const recommendation = useMemo(() => {
    if (experiment.status === 'draft') {
      return { status: 'default', title: "Not Started", message: "This experiment is not yet collecting data." };
    }
  
    // Check if experiment is < 3 days old
    const startDate = new Date(experiment.startDate);
    const daysRunning = Math.floor((new Date() - startDate) / (1000 * 60 * 60 * 24)); // calculate the number of days the experiment has been running
  
    if (daysRunning < 3) { // if the experiment is less than 3 days old, return a message saying we need at least 3 days of data
      return {
        status: 'default',
        title: "Collecting Data",
        message: "We need at least 3 days of stable data to generate a reliable recommendation."
      };
    }
  
    // Calculate Current SMA Winners
    const controlSnapshot = analysis.find(a => a.variantName === "Control");
    const controlId = experiment.variants.find(v => v.name === "Control")?.id;

    const controlHistory = experiment.analyses
    .filter(a => a.variantId === controlId)
    .sort((a, b) => new Date(b.calculatedWhen) - new Date(a.calculatedWhen))
    .slice(0, 3);

    if (!controlSnapshot || controlHistory.length < 3) {
      return {
        status: 'default',
        title: "Collecting Data",
        message: "Waiting for sufficient baseline (Control) data to stabilize."
      };
    }
    // This returns our winners
    // filter the variants to only include the variants that have a 3-day SMA >= 80% and are currently better than the control
    const currentSMAWinners = experiment.variants.filter(v => {
      if (v.name === "Control") return false;
  
      // Get the 3 most recent snapshots for THIS specific variant
      const variantHistory = experiment.analyses
        .filter(a => a.variantId === v.id)
        .sort((a, b) => new Date(b.calculatedWhen) - new Date(a.calculatedWhen))
        .slice(0, 3);
  
      if (variantHistory.length < 3) return false;
  
      // Calculate SMA
      const avgProb = variantHistory.reduce((sum, a) => sum + (a.probabilityOfBeingBest || 0), 0) / 3;
      
      const isBetterThanControl = variantHistory[0].conversionRate > controlSnapshot.conversionRate;
  
      return avgProb >= 0.8 && isBetterThanControl;
    });
    // Handle the Winner State (Deployable!)
  if (currentSMAWinners.length > 0) {
    const names = currentSMAWinners.map(v => v.name);
    
    const formatter = new Intl.ListFormat('en', { 
      style: 'long', 
      type: 'conjunction' 
    });
    
    const formattedNames = formatter.format(names);
    const verb = currentSMAWinners.length === 1 ? "is" : "are";

    return {
      status: 'success', // Polaris Green tone
      title: "Deployable!",
      message: `${formattedNames} ${verb} outperforming the control with sustained stability.`
    };
  }
  
    if (experiment.status === 'active') {
      return { 
        status: 'info', 
        title: "Keep Testing", 
        message: "Data is accumulating, but no variant has reached the 80% stability threshold yet." 
      };
    }
  
    return { status: 'default', title: "Inconclusive", message: "The experiment ended without a clear, stable winner." };
  }, [experiment, analysis]);
  // Map status to Polaris tones
  const mapTone = (status) => {
    switch (status) {
      case 'winner': return 'success';
      case 'keep_testing': return 'info';
      case 'inconclusive': return 'warning';
      default: return 'auto';
    }
  };


  // Table code
  function renderTableData() {
    if (safeAnalysis.length === 0) return [];
    const rows = [];
    const control = safeAnalysis.find(a => a.variantName === "Control");

    for (let i = 0; i < safeAnalysis.length; i++) {
      const cur = safeAnalysis[i];
      const isControl = cur.variantName === "Control";
      
      // Probability to be Best: 80% Win / 20% Loss rule
      let probColor = "inherit";
      if (cur.probabilityOfBeingBest > 0.8) probColor = "#2e7d32"; 
      else if (cur.probabilityOfBeingBest < 0.2) probColor = "#d32f2f";

      // Expected Loss: > 1% is considered a "huge problem" - Tosh
      let lossColor = "inherit";
      if (cur.expectedLoss > 0.01) lossColor = "#d32f2f";

      // Goal Completion Rate: Delta > 1% rule
      let rateColor = "inherit";
      if (!isControl && control) {
        const delta = (cur.conversionRate - control.conversionRate) * 100;
        if (delta > 1) rateColor = "#2e7d32";
        else if (delta < -1) rateColor = "#d32f2f";
      }

      // Improvement rule (> 50% Win, < 0% Loss)
      let impColor = "inherit";
      if (!isControl) {
        if (cur.improvement > 50){
          impColor = "#2e7d32";
        } else if (cur.improvement < 0){
          impColor = "#d32f2f";
        }
      }

      rows.push(
        <s-table-row key={cur.id}>
          <s-table-cell>{cur.variantName}</s-table-cell>

          {/* Goal Completion Rate: Colored only if delta is significant >1% */}
          <s-table-cell>
            <span style={{ color: rateColor }}>
              {formatPercent(cur.conversionRate)}
            </span>
          </s-table-cell>
          <s-table-cell>
            <span style = {{color: impColor}}> 
              {isControl ? 'Baseline' : formatPercent(cur.improvement / 100)}
            </span>
          </s-table-cell>
          {/* Probability to be Best: 80/20 significance rule */}
          <s-table-cell>
            <span style={{ color: probColor }}>
              {formatPercent(cur.probabilityOfBeingBest)}
            </span>
          </s-table-cell>

          {/* Expected Loss: Red indicator for high risk */}
          <s-table-cell>
            <span style={{ color: lossColor }}>
              {formatPercent(cur.expectedLoss)}
            </span>
          </s-table-cell>

          <s-table-cell>{`${cur.totalConversions} / ${cur.totalUsers}`}</s-table-cell>
        </s-table-row>
      );
    }
    return rows;
  } // end renderTableData()

  //date range and graphical code.
  // Access the date range from context (persists from reports list)
  const { dateRange } = useDateRange();

  // Client-only rendering for recharts (prevents SSR hydration mismatch)
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

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

  const heading = experiment?.name ? `Report - ${experiment.name}` : "Report";
  return (
    <s-page heading={heading}>
      <s-link slot="breadcrumb-actions" href="/app/experiments">Experiments</s-link>
      {/* Action button */}
      <s-button 
        slot="primary-action" 
        href={`/app/experiments/${experiment.id}`}
        disabled={isLocked}>
        Edit Experiment
      </s-button>
      <div 
        slot="aside" 
        style={{
          position: 'sticky',
          top: 'var(--s-spacing-large-100, .5rem)', // Use Shopify tokens for the top offset
          alignSelf: 'flex-start',
          minWidth: "300px",
          zIndex: 1, // Ensures it stays above background elements while scrolling
        }}
      >
        {/* The rest of the content remains component-based for that Shopify look */}
        <s-section
          heading="Recommended course of action"
          padding="base"
        >
          <s-stack gap="small-50">
            <s-banner
              tone={mapTone(recommendation.status)}
              heading={recommendation.title}
              dismissible={false}
            >
              <s-text color="subdued">
                {recommendation.message}
              </s-text>
            </s-banner>

            <s-section heading="Details" padding="none">
              <s-stack gap="small-200">
                <s-badge icon="target">
                  {experiment.experimentGoals?.[0]?.goal?.name || "Primary Goal"}
                </s-badge>
                <s-text type="generic">
                  Users: {(experiment.userCount ?? 0).toLocaleString()} / {(experiment.effectiveMax ?? 10000).toLocaleString()}
                </s-text>
                <s-text type="generic">Section ID: {experiment.sectionId}</s-text>
                <s-text type="generic">
                  Started: {experiment.startDate ? new Date(experiment.startDate).toLocaleDateString() : 'Not yet started'}
                </s-text>

                {/* Segment view toggle */}
                <s-box paddingBlockStart="base">
                <s-stack direction="inline" alignItems="center" gap="small">
                  <s-text type="generic">Segment:</s-text>
                  <s-box
                    border="base"
                    borderRadius="large"
                    padding="small-50"
                    background="subdued"
                  >
                    <s-stack direction="inline" gap="extra-tight">
                      <s-button
                        size="slim"
                        href={`?segment=all`}
                        variant={deviceSegment === "all" ? "primary" : "tertiary"}
                      >
                        All
                      </s-button>

                      <s-button
                        size="slim"
                        href={`?segment=mobile`}
                        variant={deviceSegment === "mobile" ? "primary" : "tertiary"}
                      >
                        Mobile
                      </s-button>

                      <s-button
                        size="slim"
                        href={`?segment=desktop`}
                        variant={deviceSegment === "desktop" ? "primary" : "tertiary"}
                      >
                        Desktop
                      </s-button>
                    </s-stack>
                  </s-box>
                </s-stack>
              </s-box>

                {/* Status + actions (bottom of side panel) */}
                <s-box paddingBlockStart="base">
                  <s-stack direction="inline" alignItems="center" justifyContent="space-between">
                    <s-stack direction="inline" gap="small" alignItems="center">
                      <s-text type="generic">Status</s-text>
                      {renderStatusBadge(status)}
                    </s-stack>

                    <s-button
                      commandFor={`status-popover-${experiment.id}`}
                      variant="tertiary"
                      icon="horizontal-dots"
                      accessibilityLabel="Change status"
                      disabled={isArchived || statusIntents.size === 0 || fetcher.state !== "idle"}
                    >
                      Change Status
                    </s-button>

                    <s-popover id={`status-popover-${experiment.id}`}>
                      <s-stack direction="block">
                        {statusIntents.has("start") && (
                          <s-button
                            variant="tertiary"
                            commandFor={`status-popover-${experiment.id}`}
                            disabled={fetcher.state !== "idle"}
                            onClick={() =>
                              fetcher.submit({ intent: "start" }, { method: "post" })
                            }
                          >
                            Start
                          </s-button>
                        )}

                        {statusIntents.has("pause") && (
                          <s-button
                            variant="tertiary"
                            commandFor={`status-popover-${experiment.id}`}
                            disabled={fetcher.state !== "idle"}
                            onClick={() =>
                              fetcher.submit({ intent: "pause" }, { method: "post" })
                            }
                          >
                            Pause
                          </s-button>
                        )}

                        {statusIntents.has("resume") && (
                          <s-button
                            variant="tertiary"
                            commandFor={`status-popover-${experiment.id}`}
                            disabled={fetcher.state !== "idle"}
                            onClick={() =>
                              fetcher.submit({ intent: "resume" }, { method: "post" })
                            }
                          >
                            Resume
                          </s-button>
                        )}

                        {statusIntents.has("end") && (
                          <s-button
                            variant="tertiary"
                            commandFor={`status-popover-${experiment.id}`}
                            disabled={fetcher.state !== "idle"}
                            onClick={() =>
                              fetcher.submit({ intent: "end" }, { method: "post" })
                            }
                          >
                            End
                          </s-button>
                        )}

                        {statusIntents.has("archive") && (
                          <s-button
                            variant="tertiary"
                            commandFor={`status-popover-${experiment.id}`}
                            disabled={fetcher.state !== "idle"}
                            onClick={() =>
                              fetcher.submit({ intent: "archive" }, { method: "post" })
                            }
                          >
                            Archive
                          </s-button>
                        )}

                        {statusIntents.has("delete") && (
                          <s-button
                            variant="tertiary"
                            commandFor={`status-popover-${experiment.id}`}
                            disabled={fetcher.state !== "idle"}
                            onClick={() =>
                              fetcher.submit({ intent: "delete" }, { method: "post" })
                            }
                          >
                            Delete
                          </s-button>
                        )}
                      </s-stack>
                    </s-popover>
                  </s-stack>

                  {fetcher.data?.error && (
                    <s-box paddingBlockStart="base">
                      <s-banner tone="critical" title="Status update failed">
                        <p>{fetcher.data.error}</p>
                      </s-banner>
                    </s-box>
                  )}
                </s-box>
              </s-stack>
            </s-section>
          </s-stack>
        </s-section>
        </div>
      <s-section> {/* Variant Success Rate [might be broken - Paul]*/}
      <s-heading>Variant Success Rate</s-heading>
        {/* Table Section of experiment list page */}
        <s-box  background="base"
                border="base"
                borderRadius="base"
                overflow="hidden"> {/*box used to provide a curved edge table */}
          <s-table>
            <s-table-header-row>
              <s-table-header listslot='primary'>Variant Name</s-table-header>
              <s-table-header listSlot="secondary">Goal Completion Rate</s-table-header>
              <s-table-header listSlot="labeled">Improvement %</s-table-header>
              <s-table-header listSlot="labeled" format="numeric">Probability to be Best</s-table-header>
              <s-table-header listSlot="labeled" format="numeric">Expected Loss</s-table-header>
              <s-table-header listSlot="labeled" >Goal Completion / Visitor</s-table-header>
            </s-table-header-row>
              <s-table-body>
                {renderTableData()}
              </s-table-body>
            </s-table>
        </s-box> {/*end of table section*/}
      </s-section>
      <s-section heading="Probability To Be The Best">
        {isClient ? (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={filteredPData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name"
                minTickGap={30}
                tick={{ fontSize: 12 }}
                tickFormatter={(tick) =>{
                  const date = new Date(tick);
                  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                }}
               />
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
              <Tooltip formatter={(value) => `${(value * 100).toFixed(2)}%`} />
              <Legend />
              <ReferenceLine
              y={0.8}
              stroke="#2c2d2c"
              strokeDasharray="5.5"
              />
              {/* Dynamically renders all variants */}
              { experiment.variants.map((v, index) => {
                // Array of colors to distinguis variants
                const colors = ["#5C6AC4", "#9C6ADE", "#00A0AC", "#FFC447"];
                return(
                  <Line
                  key={v.id}
                  type="monotone"
                  dataKey={v.name}
                  stroke={colors[index % colors.length]}
                  activeDot={{ r: 8 }}
                  dot={false}
                />
              );
              })}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ width: 700, height: 400 }}>Loading chart...</div>
        )}
      </s-section>
      <s-section heading="Expected Loss">
        {isClient ? (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={filteredELData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name"
                minTickGap={30}
                tick={{ fontSize: 12 }}
                tickFormatter={(tick) =>{
                  const date = new Date(tick);
                  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                }}
               />
              <YAxis
                width={80}
                tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
                label={{
                  value: "Expected Loss (%)",
                  angle: -90,
                  position: "insideLeft",
                  style: { textAnchor: "middle" },
                }}
              />
              <Tooltip formatter={(value) => `${(value * 100).toFixed(2)}%`} />
              <Legend />
              {/* Dynamically renders all variants */}
              { experiment.variants.map((v, index) => {
                // Array of colors to distinguis variants
                const colors = ["#5C6AC4", "#9C6ADE", "#00A0AC", "#FFC447"];
                return(
                  <Line
                  key={v.id}
                  type="monotone"
                  dataKey={v.name}
                  stroke={colors[index % colors.length]}
                  activeDot={{ r: 8 }}
                  dot={false}
                />
              );
              })}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ width: 700, height: 400 }}>Loading chart...</div>
        )}
      </s-section>
    </s-page>
  );
  }
