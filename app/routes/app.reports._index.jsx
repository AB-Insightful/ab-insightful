import { useState, useEffect, useRef } from "react";
import { useLoaderData, useFetcher } from "react-router";
import { formatRuntime } from "../utils/formatRuntime.js";
import { useDateRange } from "../contexts/DateRangeContext";
import DateRangePicker from "../components/DateRangePicker";
import SessionsCard from "../components/SessionsCard.jsx";
import ConversionCard from "../components/ConversionsCard.jsx";
import shopify from "../shopify.server";
import { ExperimentStatus } from "../utils/experimentConstants.js";
import { usePagination } from "../hooks/usePagination";
import Pagination from "../hooks/Pagination";

//server side code
export async function loader({ request }) {
  const { admin } = await shopify.authenticate.admin(request);

  // Temporary: run analysis so data is up to date. This will get replaced by cron job.

  //get the list of experiments & return them if there are any
  // Promise.all to fetch both experiments and session data in parallel for efficiency
  const [
    { experimentListReport },
    { getSessionReportData },
    { getConversionsReportData },
  ] = await Promise.all([
    import("../services/experiment.server"),
    import("../services/analytics.server"),
    import("../services/conversions.server"),
  ]);

  const [experiments, sessionData, conversionsData] = await Promise.all([
    experimentListReport(),
    getSessionReportData(admin),
    getConversionsReportData(admin),
  ]);

  //looks up tutorial data
  const { getTutorialData } = await import("../services/tutorialData.server");
  const tutorialInfo = await getTutorialData();

  // loader now returns a structured object containing both experiments and session data
  // if either is missing, it defaults to an empty array or object to prevent client-side errors
  return {
    experiments: experiments || [],
    sessionData: sessionData || { sessions: [], total: 0 },
    conversionsData: conversionsData || { sessions: [], total: 0 },
    tutorialData: tutorialInfo,
  };
}

//client side code (probably -Paul)

export async function action({ request }) {
  const formData = await request.formData();
  const intent = formData.get("intent");
  if (intent === "tutorial_viewed") {
    try {
      const { setViewedReportsPage } = await import(
        "../services/tutorialData.server"
      );
      await setViewedReportsPage(1, true); //always sets the item in tutorialdata to true, selects 1st tuple
      return { ok: true, action: "tutorial_viewed" };
    } catch (error) {
      console.error("Tutorial Error:", error);
      return (
        { ok: false, error: "Failed to update viewedListExperiment" },
        { status: 500 }
      );
    }
  }

  return { ok: false, error: "unknown intent" };
}
export default function Reports() {
  //get list of experiments
  const { experiments, sessionData, conversionsData, tutorialData } =
    useLoaderData();
  const tutorialFetcher = useFetcher(); //performs task for the tutorial popup

  const modalRef = useRef(null);

  //get date range from context
  const { dateRange } = useDateRange();

  //state for all experiments
  const allActiveExperiments = (experiments || []).filter(
    (exp) =>
      exp.status !== ExperimentStatus.archived &&
      exp.status !== ExperimentStatus.draft,
  );
  const [filteredSessionData, setFilteredSessionData] = useState(
    sessionData || { sessions: [], total: 0 },
  );
  const [filteredConversionsData, setFilteredConversionsData] = useState(
    conversionsData || { sessions: [], total: 0 },
  );
  //pagination elements
  const {
    currentPage,
    setCurrentPage,
    totalPages,
    startIndex,
    paginatedItems: paginatedExperiments,
  } = usePagination(allActiveExperiments, 6);

  //calculate runtime using formatRuntime utility
  const getRuntime = (experiment) => {
    return formatRuntime(
      experiment.startDate,
      experiment.endDate,
      experiment.status,
    );
  };

  //generate a badge for status if applicable
  const renderStatus = (status) => {
    if (!status) return "N/A";

    if (status === ExperimentStatus.active) {
      return (
        <s-badge tone="info" icon="gauge">
          Active
        </s-badge>
      );
    } else if (status === ExperimentStatus.completed) {
      return (
        <s-badge tone="success" icon="check">
          Completed
        </s-badge>
      );
    } else if (status === ExperimentStatus.archived) {
      return (
        <s-badge tone="warning" icon="order">
          Archived
        </s-badge>
      );
    } else if (status === ExperimentStatus.paused) {
      return (
        <s-badge tone="caution" icon="pause-circle">
          Paused
        </s-badge>
      );
    }
    return status;
  };

  // Render all shown report names as links to the experiment analytics page.
  const renderExperimentName = (experiment) => {
    const name = experiment.name ?? "N/A";
    return <s-link href={"/app/reports/" + experiment.id}>{name}</s-link>;
  };

  //get conversions for experiment
  const getConversionRate = (experiment) => {
    //check for analysis data
    if (experiment.analyses && experiment.analyses.length > 0) {
      //get the most recent analysis
      const latestAnalysis =
        experiment.analyses[experiment.analyses.length - 1];
      //get the conversions and users from analysis
      const { totalConversions, totalUsers } = latestAnalysis;

      //check for valid data
      if (
        totalConversions !== null &&
        totalConversions !== undefined &&
        totalUsers !== null &&
        totalUsers !== undefined
      ) {
        return `${totalConversions}/${totalUsers}`;
      }
    }
    return "N/A";
  };

  //function responsible for render of table rows based off db
  function renderTableData(experiments) {
    const rows = [];

    if (!experiments || experiments.length === 0) return rows;

    for (let i = 0; i < experiments.length; i++) {
      const curExp = experiments[i];

      rows.push(
        <s-table-row key={i}>
          <s-table-cell>{renderExperimentName(curExp)}</s-table-cell>
          <s-table-cell>{renderStatus(curExp.status)}</s-table-cell>
          <s-table-cell>{getRuntime(curExp)}</s-table-cell>
          <s-table-cell>{curExp.endCondition ?? "N/A"}</s-table-cell>
          <s-table-cell>{getConversionRate(curExp)}</s-table-cell>
        </s-table-row>,
      );
    }
    return rows;
  }

  const applyDateRange = (range) => {
    if (!range?.start || !range?.end) {
      setFilteredSessionData(sessionData || { sessions: [], total: 0 });
      setFilteredConversionsData(conversionsData || { sessions: [], total: 0 });
      return;
    }

    const start = new Date(range.start + "T00:00:00");
    const end = new Date(range.end + "T23:59:59");

    const updatedSessions = (sessionData?.sessions || []).filter((s) => {
      const d = new Date(s.date);
      return d >= start && d <= end;
    });

    const updatedConversions = (conversionsData?.sessions || []).filter((s) => {
      const d = new Date(s.date);
      return d >= start && d <= end;
    });

    setFilteredSessionData({
      sessions: updatedSessions,
      total: updatedSessions.reduce((acc, curr) => acc + curr.count, 0),
    });

    setFilteredConversionsData({
      sessions: updatedConversions,
      total: updatedConversions.reduce((acc, curr) => acc + curr.count, 0),
    });
  };

  //handle date range change from DateRangePicker component
  const handleDateRangeChange = (newDateRange) => {
    applyDateRange(newDateRange);
  };

  //filter experiments when dateRange from context changes or experiments load
  useEffect(() => {
    //tutorial display conditional
    if (
      tutorialData.viewedReportsPage == false &&
      modalRef.current &&
      typeof modalRef.current.showOverlay === "function"
    ) {
      modalRef.current.showOverlay();
    }

    if (experiments && sessionData && conversionsData) {
      applyDateRange(dateRange);
    }
  }, [tutorialData, dateRange, experiments, sessionData, conversionsData]);

  return (
    <s-page heading="Reports">
      {/* date range picker component */}
      <DateRangePicker onDateRangeChange={handleDateRangeChange} />

      {/*modal popup for tutorial */}
      <s-modal
        id="tutorial-modal-report"
        ref={modalRef}
        heading="Quick tour"
        padding="base"
        size="base"
      >
        <s-stack gap="base">
          <s-paragraph>
            Welcome to the Reports Overview page. This page provides a summary
            of experiment results and overall performance metrics. You can
            review aggregated data, compare experiments, filter reports by date
            or status, and access detailed breakdowns for deeper analysis. Use
            this page to evaluate outcomes, identify trends, and support
            data-driven decision-making.
          </s-paragraph>

          <s-button
            variant="primary"
            inLineSize="fill"
            commandFor="tutorial-modal-report"
            command="--hide"
            onClick={() => {
              tutorialFetcher.submit(
                { intent: "tutorial_viewed" },
                { method: "post" },
              );
            }}
          >
            {" "}
            Understood. Do not show this again.
          </s-button>
        </s-stack>
      </s-modal>

      {/* Analytics Dashboard Grid Section */}
      <div style={{ margin: "24px 0" }}>
        <s-layout>
          <s-layout-section variant="oneHalf">
            <ConversionCard
              conversionsData={filteredConversionsData}
              sessionData={filteredSessionData}
              hasExperiments={allActiveExperiments.length > 0}
            />
          </s-layout-section>

          <s-layout-section variant="oneHalf">
            {/* The newly implemented Sessions Card component */}
            <SessionsCard sessionData={filteredSessionData} />
          </s-layout-section>
        </s-layout>
      </div>

      <div style={{ marginBottom: "16px", marginTop: "16px" }}>
        <s-heading>Experiment Reports</s-heading>
      </div>

      <s-section>
        <s-box
          background="base"
          border="base"
          borderRadius="base"
          overflow="hidden"
        >
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">
                Experiment Name (Click To View Report)
              </s-table-header>
              <s-table-header listSlot="secondary">Status</s-table-header>
              <s-table-header listSlot="labeled">Run Length</s-table-header>
              <s-table-header listSlot="labeled" format="numeric">
                End Condition
              </s-table-header>
              <s-table-header listSlot="labeled" format="numeric">
                Conversions
              </s-table-header>
            </s-table-header-row>
            {/* This uses the destructured filteredExperiments array */}
            <s-table-body>{renderTableData(paginatedExperiments)}</s-table-body>
          </s-table>
        </s-box>
        {/*pagination controls*/}
        <Pagination
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          totalPages={totalPages}
          startIndex={startIndex}
          totalItems={allActiveExperiments.length}
          itemsPerPage={6}
        />
      </s-section>
    </s-page>
  );
}
