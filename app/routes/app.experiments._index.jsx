import { useLoaderData, useFetcher, useRevalidator } from "react-router";
import { useEffect, useRef, useState } from "react";
//import Decimal from 'decimal.js';
import { formatRuntime } from "../utils/formatRuntime.js";
import { formatImprovement } from "../utils/formatImprovement.js";
import { ExperimentStatus } from "@prisma/client";

// Server side code

export async function loader() {
  // Get the list of experiments & return them if there are any
  /**const { getExperimentsWithAnalyses } = await import("../services/experiment.server");
  const { updateProbabilityOfBest } = await import("../services/experiment.server");  */
  const { getExperimentsList, getImprovement } = await import("../services/experiment.server");
  const experiments = await getExperimentsList();

  //import for tutorial data
  const { getTutorialData } = await import ("../services/tutorialData.server");
  const tutorialData = await getTutorialData();

  // compute improvements on the server
  const enriched = await Promise.all(
    experiments.map(async (e) => ({
      ...e,
      improvement: await getImprovement(e.id),
    })),
  );

  return {experiments: enriched, tutorialData }; // resolved data only
} //end loader

//performs client to server communication when action is performed
export async function action({ request }) {
  const formData = await request.formData();
  const intent = formData.get("intent");
  const experimentId = formData.get("experimentId");

  const { 
    pauseExperiment,
    resumeExperiment,
    endExperiment,
    startExperiment,
    deleteExperiment,
    archiveExperiment, 
    getExperimentsWithAnalyses, 
    updateProbabilityOfBest 
  } = await import("../services/experiment.server");

  switch (intent) {
    case "pause":
      // Handles ET-22: Direct database update for one experiment
      try {
        await pauseExperiment(experimentId);
        return { ok: true, action: ExperimentStatus.paused };
      } catch (error) {
        console.error("Pause Error:", error);
        return { ok: false, error: "Failed to pause experiment" }, { status: 500 };
      }

    case "resume":
      try {
        await resumeExperiment(experimentId);
        return { ok: true, action: ExperimentStatus.active };
      } catch (error) {
        console.error("Resume Error:", error);
        return { ok: false, error: "Failed to resume experiment" }, { status: 500 };
      }

    case "rename": {
      const newName = (formData.get("newName") || "").trim();
      //check if null
      if (!newName) {
        return { ok: false, action: "rename_error", error: "Experiment name cannot be null" };
      }
      try {
        const { default: db } = await import("../db.server");

        //first, find the project experiment belongs to
        const existing = await db.experiment.findUnique({
          where: { id: Number(experimentId) },
          select: { projectId: true },
        });
        //if experiment is not found
        if (!existing) {
          return { ok: false, action: "rename_error", error: "Experiment not found." };
        }

        const duplicate = await db.experiment.findFirst({
          where: {
            projectId: existing.projectId,
            name: newName,
            NOT: { id: Number(experimentId) },
          },
        });
        //if name already is in the database
        if (duplicate) {
          return { ok: false, action: "rename_error", error: "An experiment with that name already exists." };
        }
        //perform the update
        await db.experiment.update({
          where: { id: Number(experimentId) },
          data: { name: newName },
        });
        //error handling
        return { ok: true, action: "renamed" };
      } catch (error) {
        console.error("Rename Error:", error);
        return { ok: false, action: "rename_error", error: "Failed to rename experiment." };
      }
    }

    case "archive":
      try {
        await archiveExperiment(experimentId);
        return {ok: true, action: ExperimentStatus.archived}; 
      } catch (error) {
        console.error("Archive Error:", error);
        return {ok: false, error: "Failed to archive experiment"}, { status: 500};
      }

      //performs switch case action upon clicking 'I understand" button for tutorial modal
      case "tutorial_viewed":
      try {
        const { setViewedListExp } = await import("../services/tutorialData.server");
        await setViewedListExp(1, true); //always sets the item in tutorialdata to true, selects 1st tuple
        return {ok: true, action: "tutorial_viewed"}; 
      } catch (error) {
        console.error("Tutorial Error:", error);
        return {ok: false, error: "Failed to update viewedListExperiment"}, { status: 500};
      }
    
    case "delete":
      try {
        await deleteExperiment(experimentId);
        return { ok: true, action: "deleteExperiment" };
      } catch (error) {
        console.error("Delete Error:", error);
        return { ok: false, error: "Failed to delete experiment"}, {status: 500}
      }

    case "start":
      try {
        await startExperiment(experimentId);
        return { ok: true, action: ExperimentStatus.active };
      } catch (error) {
        console.error("Start Error:", error);
        return { ok: false, error: "Failed to start experiment"}, {status: 500}
      }

    case "end":
      try {
        await endExperiment(experimentId);
        return { ok: true, action: ExperimentStatus.completed };
      } catch (error) {
        console.error("End Error:", error);
        return { ok: false, error: "Failed to end experiment"}, {status: 500}
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
  const modalRef = useRef(null);
  const {experiments, tutorialData} = useLoaderData();
  const fetcher = useFetcher();
  const tutorialFetcher = useFetcher();
  const didStatsRun = useRef(false); //useRef is a modifier that ensure the didStatsRun value mutation is retained across re-renders of page
  const revalidator = useRevalidator(); 

  //track current experiment row in rename mode, current value in text box, and error message
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState(null);

  //check for errors after rename attempt
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.action === "rename_error") {
      setRenameError(fetcher.data.error);
    }
    if (fetcher.state === "idle" && fetcher.data?.action === "renamed") {
      // Success — close the field
      setRenamingId(null);
      setRenameError(null);
    }
  }, [fetcher.state, fetcher.data]);

  //applying calculations of stats here to retain read/write separation between action and loader.
  useEffect(() => {
    // show tutorial modal
    if (
      tutorialData?.viewedListExperiment === false &&
      modalRef.current &&
      typeof modalRef.current.showOverlay === "function"
    ) {
      modalRef.current.showOverlay();
    }

    // run stats calc once
    if (didStatsRun.current) return;
    if (fetcher.state === "idle") {
      didStatsRun.current = true;
      fetcher.submit(null, { method: "post" });
    }
  }, [fetcher.state, tutorialData]);

  //refresh after popover selection
  useEffect(() => {
    if (fetcher.state !== "idle") return;
    if (!fetcher.data?.ok) return;

    const refreshActions = [
      ExperimentStatus.paused,
      ExperimentStatus.active,
      ExperimentStatus.completed,
      ExperimentStatus.archived,
      "deleteExperiment"
    ];

    if (refreshActions.includes(fetcher.data.action)) {
      revalidator.revalidate();
    }
    
  }, [fetcher.state, fetcher.data, revalidator]);


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
  //validates & submit rename
  function submitRename(experimentId) {
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenameError("Experiment name cannot be null");
      return;
    }
    setRenameError(null);
    fetcher.submit(
      { intent: "rename", experimentId, newName: trimmed },
      { method: "post" }
    );
  }

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

      const resumeLabel = curExp.startDate ? "Resume" : "Start";

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
            {/*display rename mode or link to experiment*/}
            {renamingId === curExp.id ? (
              <s-stack direction="block" gap="tight">
                <s-stack direction="inline" gap="tight" alignItems="center">
                  <s-text-field
                    label="Experiment name"
                    labelHidden
                    value={renameValue}
                    error={renameError ?? undefined}
                    onInput={(e) => {
                      setRenameValue(e.target.value);
                      //clear all errors on input
                      if (renameError) setRenameError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitRename(curExp.id);
                      if (e.key === "Escape") {
                        setRenamingId(null);
                        setRenameError(null);
                      }
                    }}
                  />
                  <s-button
                    variant="tertiary"
                    icon="check-circle"
                    accessibilityLabel="Confirm rename"
                    disabled={fetcher.state !== "idle"}
                    onClick={() => submitRename(curExp.id)}
                  />
                  <s-button
                    variant="tertiary"
                    icon="x-circle"
                    accessibilityLabel="Cancel rename"
                    onClick={() => {
                      setRenamingId(null);
                      setRenameError(null);
                    }}
                  />
                </s-stack>
              </s-stack>
            ) : (
              <s-link href={"/app/reports/" + curExp.id}>
                {curExp.name ?? "empty-name"}
              </s-link>
            )}
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

                <s-button 
                  variant="tertiary" 
                  commandFor={`popover-${curExp.id}`}
                  disabled={fetcher.state !== "idle"}
                  onClick={() => {
                    setRenamingId(curExp.id);
                    setRenameValue(curExp.name ?? "");
                    setRenameError(null);
                  }}
                >
                  Rename
                </s-button>

                {curExp.status === ExperimentStatus.draft && (
                  <s-button 
                    variant="tertiary" 
                    commandFor={`popover-${curExp.id}`}
                    disabled={ fetcher.state !== "idle"}
                    onClick={() => {
                      console.log(`%c [START TRIGGERED] ID: ${curExp.id}`, "color: #008060; font-weight: bold;");
                      fetcher.submit(
                        {
                          intent:"start",
                          experimentId: curExp.id
                        },
                        { method: "post"}
                      );
                    }}
                  >
                    Start
                  </s-button>
                )}

                {curExp.status === ExperimentStatus.active && (
                  <s-button 
                    variant="tertiary" 
                    commandFor={`popover-${curExp.id}`}
                    disabled={fetcher.state !== "idle"}
                    onClick={() => {
                      console.log(`%c [PAUSE TRIGGERED] ID: ${curExp.id}`, "color: #FFC453; font-weight: bold;");
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
                )}

                {(curExp.status === ExperimentStatus.active || curExp.status === ExperimentStatus.paused) && (
                  <s-button 
                    variant="tertiary" 
                    commandFor={`popover-${curExp.id}`}
                    disabled={fetcher.state !== "idle"}
                    onClick={() => {
                      console.log(`%c [END TRIGGERED] ID: ${curExp.id}`, "color: #6B4EFF; font-weight: bold;");
                      fetcher.submit(
                        {
                          intent:"end",
                          experimentId: curExp.id
                        },
                        { method: "post"}
                      );
                    }}
                  >
                    End
                  </s-button>
                )}

                {curExp.status === ExperimentStatus.paused && (
                  <s-button 
                    variant="tertiary" 
                    commandFor={`popover-${curExp.id}`}
                    disabled={fetcher.state !== "idle"}
                    onClick={() => {
                      console.log(`%c [RESUME TRIGGERED] ID: ${curExp.id}`, "color: #2C6ECB; font-weight: bold;");
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
                )}

                {curExp.status === ExperimentStatus.completed && (
                  <s-button 
                    variant="tertiary" 
                    commandFor={`popover-${curExp.id}`}
                    disabled={fetcher.state !== "idle"}
                    onClick={() => {
                      console.log(`%c [ARCHIVE TRIGGERED] ID: ${curExp.id}`, "color: #8C9196; font-weight: bold;");
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
                )}

                {curExp.status === ExperimentStatus.draft && (
                  <s-button 
                    variant="tertiary" 
                    commandFor={`popover-${curExp.id}`}
                    disabled={fetcher.state !== "idle"}
                    onClick={() => {
                      console.log(`%c [DELETE TRIGGERED] ID: ${curExp.id}`, "color: #D82C0D; font-weight: bold;");
                      fetcher.submit(
                        {
                          intent: "delete",
                          experimentId: curExp.id,
                        },
                        { method: "post" }
                      );

                    }}
                  >
                    Delete
                  </s-button>
                )}
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
        {/*modal for tutorial popup */}
          <s-modal
            id="tutorial-modal-settings"
            ref={modalRef}
            heading="Quick tour"
            padding="base"
            size="base"
          >
            <s-stack gap="base">
              <s-paragraph>
                Here is some tutorial information.
              </s-paragraph>
            
                <s-button
                variant="primary"
                inLineSize = "fill"
                commandFor="tutorial-modal-settings"
                command="--hide"
                onClick = {() => {
                  tutorialFetcher.submit(
                    { intent: "tutorial_viewed"},
                    {method: "post"}
                  )
                }}
                > Understood. Do not show this again.
                </s-button>
            </s-stack>
          </s-modal>
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