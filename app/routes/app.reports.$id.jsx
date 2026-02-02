// Report page for an individual experiment

import { useLoaderData } from "react-router";

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
  console.log(experiment);
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
      </div>
      <s-section heading="Probability To Be The Best">
        Visualization goes here
      </s-section>
      <s-section heading="Expected Loss">Visualization goes here</s-section>
    </s-page>
  );
}
