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
  const analysis = await Promise.all(
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

  return { experiment: experimentReportData, analysis };

}

export default function Report() {
  // Load report information
  const { experiment, analysis } = useLoaderData();

  // Human readable metrics helper
  const formatPercent = (val) => {
    if (val === null || val === undefined) return "-";
    return ( val * 100 ).toFixed(2)+"%";
  }
  
  //table code
  function renderTableData()
  {
    //const analysisInstance = analysis[0];
    const rows = [];
    // Identifies the winner by finding the variant w/ high prob to be best
    const winnderIndex = analysis.reduce((prev,curr,idx,arr) =>
      curr.probabilityOfBeingBest > arr[prev].probabilityOfBeingBest ? idx : prev, 0);

    for (let i = 0; i < analysis.length; i++ )
    {
      const curAnalysis = analysis[i];
      const isWinner = i === winnderIndex;
      const metricColor = isWinner ? "#2e7d32" : "#d32f2f";
      // First variant (index 0) is always control/baseline 
      let improvementDisplay = i === 0 ? 'Baseline' : formatPercent(curAnalysis.improvement / 100);
      
      rows.push(
      <s-table-row key={curAnalysis.id}>
        {/* Variant Label */}
        <s-table-cell> {curAnalysis.variantName} </s-table-cell>
        
        {/* Goal Completion Rate */}
        <s-table-cell style={{ color: metricColor }}>
          <span style={{ color: metricColor}}>
          {formatPercent(curAnalysis.conversionRate)} 
          </span> 
        </s-table-cell>
        
        <s-table-cell> {improvementDisplay} </s-table-cell>
        
        {/* Probability to be Best formatted */}
        <s-table-cell style={{ color: metricColor }}>
          <span style={{ color: metricColor}}> 
          {formatPercent(curAnalysis.probabilityOfBeingBest)} 
          </span>
        </s-table-cell>
        
        {/* Expected Loss formatted */}
        <s-table-cell> {formatPercent(curAnalysis.expectedLoss)} </s-table-cell>
        
        {/* Goal Completion / Visitor */}
        <s-table-cell> {`${curAnalysis.totalConversions} / ${curAnalysis.totalUsers}`} </s-table-cell>
      </s-table-row>
    );
    
    }
    return rows
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
      <s-button
        slot="primary-action"
        href={`/app/experiments/${experiment.id}`}
      >
        Edit Experiment
      </s-button>
      <div style={{ marginBottom: "16px", marginTop: "16px" }}>
        <s-heading>Experiment Reports</s-heading>
        <DateRangePicker />
        {dateRange && (
          <s-text tone="subdued">
            Viewing data from {formatDateForDisplay(dateRange.start)} to{" "}
            {formatDateForDisplay(dateRange.end)}
          </s-text>
        )}
        {/*appears to be graph page render data */}
        
      </div>
      <s-section> {/*might be broken */}
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
      </s-section>
      <s-section heading="Expected Loss">
        {isClient ? (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={filteredELData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis
                width={80}
                tickFormatter={(value) => `${(value * 100).toFixed(1)}%`}
                label={{
                  value: "Expected Loss (%)",
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
      </s-section>
    </s-page>
  );
}
