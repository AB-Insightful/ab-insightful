// Report page for an individual experiment

import { useState, useEffect } from "react";
import { useLoaderData } from "react-router";
import {
  useDateRange,
  formatDateForDisplay,
} from "../contexts/DateRangeContext";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
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

  return { experiment: experimentReportData };
}

export default function Report() {
  // Load report information
  const { experiment } = useLoaderData();

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
        {dateRange && (
          <s-text tone="subdued">
            Viewing data from {formatDateForDisplay(dateRange.start)} to{" "}
            {formatDateForDisplay(dateRange.end)}
          </s-text>
        )}
      </div>
      <s-section heading="Probability To Be The Best">
        {isClient ? (
          <LineChart
            style={{
              width: "100%",
              maxWidth: "1000px",
              height: "100%",
              maxHeight: "400px",
              aspectRatio: 1.5,
            }}
            responsive
            data={probabilityData}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis
              width="auto"
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
        ) : (
          <div style={{ width: 700, height: 400 }}>Loading chart...</div>
        )}
      </s-section>
      <s-section heading="Expected Loss">
        {isClient ? (
          <LineChart
            style={{
              width: "100%",
              maxWidth: "1000px",
              height: "100%",
              maxHeight: "400px",
              aspectRatio: 1.5,
            }}
            responsive
            data={expectedLossData}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis
              width="auto"
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
        ) : (
          <div style={{ width: 700, height: 400 }}>Loading chart...</div>
        )}
      </s-section>
    </s-page>
  );
}
