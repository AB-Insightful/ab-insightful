import { useLoaderData, useFetcher } from "react-router";
import { useEffect, useRef } from "react";
//import Decimal from 'decimal.js';
import { formatRuntime } from "../utils/formatRuntime.js";
import { formatImprovement } from "../utils/formatImprovement.js";

// Server side code

export async function loader() {
  // Get the list of experiments & return them if there are any
  /**const { getExperimentsWithAnalyses } = await import("../services/experiment.server");
  const { updateProbabilityOfBest } = await import("../services/experiment.server");  */
  const { getExperimentsList, getImprovement } = await import("../services/experiment.server");

  const experiments = await getExperimentsList();

  // compute improvements on the server
  const enriched = await Promise.all(
    experiments.map(async (e) => ({
      ...e,
      improvement: await getImprovement(e.id),
    })),
  );

  return enriched; // resolved data only
} //end loader


export async function action({ request }) {
  const formData = await request.formData();
  const intent = formData.get("intent");
  const experimentId = formData.get("experimentId");

  const { 
    pauseExperiment, 
    getExperimentsWithAnalyses, 
    updateProbabilityOfBest 
  } = await import("../services/experiment.server");

  switch (intent) {
    case "pause":
      // Handles ET-22: Direct database update for one experiment
      try {
        await pauseExperiment(experimentId);
        return { ok: true, action: "paused" };
      } catch (error) {
        console.error("Pause Error:", error);
        return { ok: false, error: "Failed to pause experiment" }, { status: 500 };
      }

    case "resume":
      try {
        const { resumeExperiment } = await import("../services/experiment.server");
        await resumeExperiment(experimentId);
        return { ok: true, action: "resumed" };
      } catch (error) {
        console.error("Resume Error:", error);
        return { ok: false, error: "Failed to resume experiment" }, { status: 500 };
      }

    case "rename":
      // dynamically imported redirect utility
      const { redirect } = await import("@remix-run/node")
      // return the rediret of the unique experiment page 
      return redirect(`/app/experiments/${experimentId}`);

    case "archive":
      try {
        const { archiveExperiment } = await import("../services/experiment.server");
        await archiveExperiment(experimentId);
        return {ok: true, action: "archived"}; 
      } catch (error) {
        console.error("Archive Error:", error);
        return {ok: false, error: "Failed to archive experiment"}, { status: 500};
      }

      default:
      /* The default case, where experiment stats are queried from the DB & rendered */
      try {
        const list = await getExperimentsWithAnalyses();
        await updateProbabilityOfBest(list);
        return { ok: true, action: "analysis_updated" };
      } catch (error) {
        console.error("Analysis Error:", error);
        return { ok: false, error: "Stats calculation failed" }, { status: 500 };
      }
  }
}

// ---------------------------------Client side code----------------------------------------------------
export default function Experimentsindex() {
  // Get list of experiments
  const experiments = useLoaderData();
  const fetcher = useFetcher();
  const didStatsRun = useRef(false); //useRef is a modifier that ensure the didStatsRun value mutation is retained across re-renders of page

  //applying calculations of stats here to retain read/write separation between action and loader.
  useEffect(() => {
    if (didStatsRun.current == true) return;
    if (fetcher.state === "idle") {
      didStatsRun.current = true;
      fetcher.submit(null, { method: "post" });
    }
  }, [fetcher]);

  //function responsible for render of table rows based off db

  const VALID_STATUSES = new Set([
    "draft",
    "active",
    "paused",
    "completed",
    "archived",
  ]);

  const getDisplayStatus = (status) => {
    const normalized = typeof status === "string" ? status.toLowerCase().trim() : "";
    if (!VALID_STATUSES.has(normalized)) return "—";
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  };

  const renderStatus = (status) => {
    const displayStatus = getDisplayStatus(status);
    if (displayStatus === "—") return "—";

    if (displayStatus === "Active") {
      return (
        <s-badge tone="info" icon="gauge">
          Active
        </s-badge>
      );
    }

    if (displayStatus === "Completed") {
      return (
        <s-badge tone="success" icon="check">
          Completed
        </s-badge>
      );
    }

    if (displayStatus === "Paused") {
      return (
        <s-badge tone="caution" icon="pause-circle">
          Paused
        </s-badge>
      );
    }

    if (displayStatus === "Archived") {
      return (
        <s-badge tone="warning" icon="order">
          Archived
        </s-badge>
      );
    }

    return <s-badge icon="draft-orders">Draft</s-badge>;
  };

  //TODO: restrict based on experiment goal
  //- re
  function renderTableData(experiments) {
    const rows = [];

    //retrieves the highest probability of best from the experiment and the winning variant's name
    //PLEASE NOTE: This function does not account for an experiment having multiple entries with different goals. 
    //It will simply pick the highest probability (apples to oranges comparison). 
    const getProbabilityOfBest = (experiment) => {
      //check for analysis data
      if (experiment.analyses && experiment.analyses.length > 0) {
        let probabilityOfBestArr = [];
        let probabilityOfBestName = [];
        let i = 0;
        for (i in experiment.analyses) {
          const analysisInstance = experiment.analyses[i];
          const nameInstance = experiment.analyses[i].variant;
          probabilityOfBestArr.push(analysisInstance.probabilityOfBeingBest);
          probabilityOfBestName.push(nameInstance.name);
        }

        let maxValue = Math.max(...probabilityOfBestArr);
        const maxIndex = probabilityOfBestArr.indexOf(maxValue);
        const maxTrunc = Math.trunc(maxValue * 10000) / 10000; //manual truncation to avoid judicious rounding
        const bestName = probabilityOfBestName[maxIndex];
        const maxValueFormatted = (100 * maxTrunc).toFixed(2); //shifts decimals over to string version (e.g. .6789 to 67.89)

        //get the most recent analysis
        const latestAnalysis =
          experiment.analyses[experiment.analyses.length - 1]; //assumes there are not multiple analyses
        //get the conversions and users from analysis
        const { otherThing, probabilityOfBeingBest } = latestAnalysis;

        //(parseFloat(probabilityOfBeingBest) * 100).toFixed(2)
        //check for valid data
        //checks for negative or illogical values (should be between 1 and 0)
        if (maxValue < 0 || maxValue > 1) {
          return "N/A";
        }
        if (
          probabilityOfBeingBest !== null &&
          probabilityOfBeingBest !== undefined
        ) {
          return `${bestName} (${maxValueFormatted}%)`;
        }
      }
      return "inconclusive";
    };

    for (let i = 0; i < experiments.length; i++) {
      //single tuple of the experiment data
      const curExp = experiments[i];

      // call formatRuntime utility
      const runtime = formatRuntime(
        curExp.startDate,
        curExp.endDate,
        curExp.status,
      );

      const improvement = curExp.improvement; // placeholder for improvement calculation

      //pushes javascripts elements into the array
      rows.push(
        <s-table-row key={curExp.id}>
          <s-table-cell>
            <s-link href={"/app/reports/" + curExp.id}>
              {curExp.name ?? "empty-name"}
            </s-link>
          </s-table-cell>{" "}
          {/* displays N/A when data is null */}
          <s-table-cell>{renderStatus(curExp.status)}</s-table-cell>
          <s-table-cell> {runtime} </s-table-cell>
          <s-table-cell>N/A</s-table-cell>
          {/* Improvement Cell */}
          <s-table-cell>{formatImprovement(improvement)}</s-table-cell>
          {/* Probability Cell */}
          <s-table-cell>{getProbabilityOfBest(curExp)}</s-table-cell>
          {/* Quic Access Menu */}
          <s-table-cell>
            <s-button 
              commandFor={`popover-${curExp.id}`}
              variant="tertiary"
              icon="horizontal-dots"
              accessibilityLabel="More options"
            >
              ...
            </s-button>
            <s-popover id={`popover-${curExp.id}`}>
              <s-stack direction="block">
                {/* command="hide" closes the popover when the button is clicked */}
                <s-button 
                  variant="tertiary" 
                  commandFor={`popover-${curExp.id}`}
                  onClick={() => {
                    fetcher.submit(
                      {
                        intent: "rename",
                        experimentId: curExp.id
                      },
                      { method: "post" }
                    );
                  }}
                >
                  Rename
                </s-button>
                <s-button 
                  variant="tertiary" 
                  commandFor={`popover-${curExp.id}`}
                  disabled={curExp.status === "paused" || curExp.status === "archived" || fetcher.state !== "idle"}
                  onClick={() => {
                    console.log(`%c [PAUSE TRIGGERED] ID: ${curExp.id}`, "color: #008060; font-weight: bold;");
                    fetcher.submit(
                      {
                        intent:"pause",
                        experimentId: curExp.id
                      },
                      { method: "post"}
                    );
                  }}
                >
                  Pause
                </s-button>
                <s-button 
                  variant="tertiary" 
                  commandFor={`popover-${curExp.id}`}
                  disabled={curExp.status === "active" || fetcher.state !== "idle"}
                  onClick={() => {
                    fetcher.submit(
                      {
                        intent: "resume",
                        experimentId: curExp.id
                      },
                      { method: "post" }
                    );
                  }}
                >
                  Resume
                </s-button>
                <s-button 
                  variant="tertiary" 
                  commandFor={`popover-${curExp.id}`}
                  disabled={curExp.status === "archived" || fetcher.state !== "idle"}
                  onClick={() => {
                    fetcher.submit(
                      {
                        intent: "archive",
                        experimentId: curExp.id
                      },
                      { method: "post"}
                    );
                  }}
                >
                  Archive
                </s-button>
              </s-stack>
            </s-popover>
          </s-table-cell>
        </s-table-row>
      )
    }
    return rows;
  } // end renderTableData function

  if (experiments.length > 0) {
    return (
      <s-page heading="Experiment Management">
        <s-button
          slot="primary-action"
          variant="primary"
          href="/app/experiments/new"
        >Create Experiment</s-button>
        <s-section>
          {" "}
          {/*might be broken */}
          <s-heading>Experiment List</s-heading>
          {/* Table Section of experiment list page */}
          <s-box  background="base"
                  border="base"
                  borderRadius="base"
                  //overflow="hidden"
                  > 
                  {/*box used to provide a curved edge table */}
            <s-table>
              <s-table-header-row>
                <s-table-header listslot="primary">Name</s-table-header>
                <s-table-header listSlot="secondary">Status</s-table-header>
                <s-table-header listSlot="labeled">Runtime</s-table-header>
                <s-table-header listSlot="labeled" format="numeric">Goal Completion Rate</s-table-header>
                <s-table-header listSlot="labeled" format="numeric">Improvement (%)</s-table-header>
                <s-table-header listSlot="labeled" format="numeric">Probability to be the best</s-table-header>
                <s-table-header></s-table-header> {/* New empty header for the action column */}
                {/*Place Quick Access Button here */}
              </s-table-header-row>
              <s-table-body>
                {renderTableData(experiments)}{" "}
                {/* function call that returns the jsx data for table rows */}
              </s-table-body>
            </s-table>
          </s-box>{" "}
          {/*end of table section*/}
        </s-section>
      </s-page>
    );
    //if there are no experiments, alternate display page
  } else {
    return (
      //todo put an button here
      <s-section heading="Experiments">
        <s-button
          slot="primary-action"
          variant="primary"
          href="/app/experiments/new"
        >Create Experiment</s-button>
        <s-section></s-section>
        <s-grid gap="base" justifyItems="center" paddingBlock="large-500">
          <s-box maxInlineSize="400px" maxBlockSize="400px">
            <s-image
              aspectRatio="1/1.5"
              src="/Group-182.svg"
              alt="Empty state image"
            />
          </s-box>
          <s-grid justifyItems="center" maxInlineSize="450px" gap="base">
            <s-stack alignItems="center">
              <s-heading>Your experiments will show here</s-heading>
              <s-paragraph>
                This is where you will examine and select from your list of
                experiments.
              </s-paragraph>
              <s-button variant="primary" href="/app/experiments/new">
                Create Experiment
              </s-button>
            </s-stack>
          </s-grid>
        </s-grid>
      </s-section>
    );
  }
} //end of Experimentsindex
