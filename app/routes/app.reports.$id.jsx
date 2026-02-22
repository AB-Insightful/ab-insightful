// Report page for an individual experiment

import { useState, useEffect, useMemo } from "react";
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
  ReferenceLine
} from "recharts";

// Server-side loader. params is for the id
export async function loader({ params }) {
  // Parse the experiment ID from parameters
  const experimentId = parseInt(params.id);

  // Validate experiment ID
  if (!experimentId || isNaN(experimentId)) {
    return { experiment: null };
  }

  // Lookup experiment data
  const { getExperimentReportData } = await import(
    "../services/experiment.server"
  );
  const experimentReportData = await getExperimentReportData(experimentId);

  //additional loader data
  if (!Number.isInteger(experimentId)) throw new Response("Invalid id", {status: 400}); //basic safety check for valid exp id

  const { getVariants } = await import("../services/variant.server");
  const variants = await getVariants(experimentId);
  const { getAnalysis } = await import("../services/experiment.server");
  
  const {getExperimentById} = await import("../services/experiment.server");
  const experimentInfo = await getExperimentById(experimentId);
  const {getImprovement} = await import("../services/experiment.server");
  const improvementPercent = await getImprovement(experimentId);

  //improves performance by performing queries synchronized, then wait for all of queries to finish. 
  const results = await Promise.all(
    variants.map(async (v) => {
      const a = await getAnalysis(experimentId, v.id);
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
  return { experiment:{ 
    ...experimentReportData,
    status: experimentInfo.status,
    startDate: experimentInfo.startDate
  },
  analysis
};
}

export default function Report() {
  // Load report information
  const { experiment, analysis } = useLoaderData();

  // Human readable metrics helper
  const formatPercent = (val) => {
    if (val === null || val === undefined) return "-";
    return ( val * 100 ).toFixed(2)+"%";
  }
  // Building the recommendation payload
  const recommendation = useMemo(() => {
  const isCurrentlyActive = experiment.status === 'active';
  const isCompleted = experiment.status === 'completed' || experiment.status === 'paused';
  
  const PROB_THRESHOLD = 0.8;
  const DELTA_THRESHOLD = 0.01;
  const control = analysis[0]; // baseline

  // if no analysis exists yet
  if (!control){
    return {
      status: 'default',
      title: "Collectiong Data",
      message: "We need more visitors to generate a report."
    };
  }
  
  /* Searches for variants in the experiment which 
  *  currently have a PoB >= 80% */ 
  const currentWinners = analysis.slice(1).filter(variant => {
    const delta = variant.conversionRate - control.conversionRate;
    return variant.probabilityOfBeingBest >= PROB_THRESHOLD && delta > DELTA_THRESHOLD;
  });

  /* Scans entire history of the experiment to find
  *  if at any point any of the variants reached >= 80% PoB */  
  const historicalWinners = experiment.analyses.filter(a => 
    a.variant.name !== 'Control' && 
    a.probabilityOfBeingBest >= PROB_THRESHOLD
  );

  // Currently Winning state
  if (currentWinners.length > 0) {
    const formatter = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' });
    const winnerNames = formatter.format(currentWinners.map(w => w.variantName));
    const isPlural = currentWinners.length > 1;

    return { 
      status: 'winner',
      title: isPlural ? "Multiple Variants are Deployable!" : "Deployable!",
      message: `${winnerNames} ${isPlural ? "are" : "is"} winning!`, 
    };
  }

  // Peaked previously but needs more stability state
  if (historicalWinners.length > 0 && isCurrentlyActive) {
    const uniquePeakedNames = [...new Set(historicalWinners.map(hw => hw.variant.name))];
    return { 
      status: 'keep_testing', 
      title: "Continue Testing", 
      message: `${uniquePeakedNames.join(", ")} hit 80% previously. Keep running for stability.`, 
    };
  }
  
  // Active but no winner yet state
  if (isCurrentlyActive) {
    return { status: 'keep_testing', title: "Continue Testing", message: "No clear winner yet." }
  }

  // Experiment ended with no winner state
  if (isCompleted) {
    return { status: 'inconclusive', title: "Inconclusive", message: "No clear winner was found." };
  }
   // Experiment is not active state
   return { status: 'default', title: "Draft", message: "Experiment is not active." };
   }, [analysis, experiment.status, experiment.analyses]);
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
    if (analysis.length === 0 ) return []; // simple exit if the array is empty
    const rows = [];
    const control = analysis[0]; // Reference the baseline for delta calculations

    for (let i = 0; i < analysis.length; i++) {
      const cur = analysis[i];
      
      // Probability to be Best: 80% Win / 20% Loss rule
      let probColor = "inherit"; // inherit ensures the default font color is used if no winner/loser
      if (cur.probabilityOfBeingBest > 0.8) probColor = "#2e7d32"; 
      else if (cur.probabilityOfBeingBest < 0.2) probColor = "#d32f2f";

      // Expected Loss: > 1% is considered a "huge problem" - Tosh
      let lossColor = "inherit";
      if (cur.expectedLoss > 0.01) lossColor = "#d32f2f";

      // Goal Completion Rate: Delta > 1% rule
      let rateColor = "inherit";
      if (i > 0 && control) {
        const delta = (cur.conversionRate - control.conversionRate) * 100;
        if (delta > 1) rateColor = "#2e7d32";
        else if (delta < -1) rateColor = "#d32f2f";
      }

      // Improvement rule (> 50% Win, < 0% Loss)
      let impColor = "inherit";
      if (i>0){ // skips Control since it's BaseLine
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
              {i === 0 ? 'Baseline' : formatPercent(cur.improvement / 100)}
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
      {/* Action button */}
      <s-button slot="primary-action" href={`/app/experiments/${experiment.id}`}>
        Edit Experiment
      </s-button>
      <div 
        slot="aside" 
        style={{
          position: 'sticky',
          top: 'var(--s-spacing-large-100, .5rem)', // Use Shopify tokens for the top offset
          alignSelf: 'flex-start',
          width: '250px',
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
                <s-text type="generic">Section ID: {experiment.sectionId}</s-text>
                <s-text type="generic">Status: {experiment.status}</s-text>
                <s-text type="generic">
                  Started: {experiment.startDate ? new Date(experiment.startDate).toLocaleDateString() : 'Not yet started'}
                </s-text>
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
              <XAxis dataKey="name" />
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
