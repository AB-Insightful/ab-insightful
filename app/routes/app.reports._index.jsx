import { useState, useEffect } from "react";
import { useLoaderData } from "react-router";
import { formatRuntime } from "../utils/formatRuntime.js";
import { useDateRange } from "../contexts/DateRangeContext";
import DateRangePicker from "../components/DateRangePicker";
import SessionsCard from "../components/SessionsCard.jsx";
import shopify from "../shopify.server";

//server side code
export async function loader({request}) {
const {admin } = await shopify.authenticate.admin(request);

  //get the list of experiments & return them if there are any
  // Promise.all to fetch both experiments and session data in parallel for efficiency
  const [
    { getExperimentsList1 },
    { getSessionReportData }
  ] = await Promise.all([
    import("../services/experiment.server"),
    import("../services/analytics.server")
  ]);

  const [experiments, sessionData] = await Promise.all([
    getExperimentsList1(),
    getSessionReportData(admin) // Pass the authenticated admin here
  ]);

  // loader now returns a structured object containing both experiments and session data
  // if either is missing, it defaults to an empty array or object to prevent client-side errors
  return { 
    experiments: experiments || [], 
    sessionData: sessionData || { sessions: [], total: 0 } 
  };
}

export default function Reports() {
  //get list of experiments
  const {experiments, sessionData} = useLoaderData();

  //get date range from context
  const { dateRange } = useDateRange();

  //state for filtered experiments
  const [filteredExperiments, setFilteredExperiments] = useState(experiments || []);
  const [filteredSessionData, setFilteredSessionData] = useState(sessionData || { sessions: [], total: 0 });

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

    if (status.toLowerCase() === "active") {
      return (
        <s-badge tone="info" icon="gauge">
          Active
        </s-badge>
      );
    } else if (status.toLowerCase() === "completed") {
      return (
        <s-badge tone="success" icon="check">
          Completed
        </s-badge>
      );
    } else if (status.toLowerCase() === "archived") {
      return (
        <s-badge tone="warning" icon="order">
          Archived
        </s-badge>
      );
    } else if (status.toLowerCase() === "paused") {
      return (
        <s-badge tone="caution" icon="pause-circle">
          Paused
        </s-badge>
      );
    }
    return status;
  };

  //render experiment name with link if not active
  const renderExperimentName = (experiment) => {
    const name = experiment.name ?? "N/A";

    if (!experiment.status || experiment.status.toLowerCase() === "active") {
      return name;
    }
    return <a href="/404">{name}</a>;
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

  //filter experiments based on date range
  //updated to exclude archived experiments
  const filterByDateRange = (start, end) => {
    if (!experiments) return [];

    const startDate = new Date(start);
    const endDate = new Date(end);

    return experiments.filter((exp) => {
      if (!exp.startDate) return false;
      if (exp.status.toLowerCase() === "archived") return false;
      const expStartDate = new Date(exp.startDate);
      return expStartDate >= startDate && expStartDate <= endDate;
    });
  };

  //handle date range change from DateRangePicker component
  const handleDateRangeChange = (newDateRange) => {
    setFilteredExperiments(
      filterByDateRange(newDateRange.start, newDateRange.end),
    );

    const start = new Date(newDateRange.start+"T00:00:00");
    const end = new Date(newDateRange.end+"T23:59:59");

    const updatedSessions = sessionData.sessions.filter((s) => {
      const d = new Date(s.date);
      return d >= start && d <= end;
    });
    setFilteredSessionData({ sessions: updatedSessions, total: updatedSessions.reduce((acc, curr) => acc + curr.count, 0) });
  };

  //filter experiments when dateRange from context changes or experiments load
  useEffect(() => {
    if (dateRange && experiments && sessionData) {
      setFilteredExperiments(filterByDateRange(dateRange.start, dateRange.end));

      const start = new Date(dateRange.start+"T00:00:00");
      const end = new Date(dateRange.end+"T23:59:59");

      const updatedSession = sessionData.sessions.filter((s) => {
        const d = new Date(s.date);
        return d >= start && d <= end;
      });
    setFilteredSessionData({ sessions: updatedSession, total: updatedSession.reduce((acc, curr) => acc + curr.count, 0) 
    });
    }
  }, [dateRange, experiments, sessionData]);

  return (
    <s-page heading="Reports">
      {/* date range picker component */}
      <DateRangePicker onDateRangeChange={handleDateRangeChange} />

      {/* Analytics Dashboard Grid Section */}
      <div style={{ margin: "24px 0" }}>
        <s-layout>
          <s-layout-section variant="oneHalf">
            {/* Placeholder for Conversion Rate Card to match mockup */}
            <s-card>
              <div style={{ padding: "16px" }}>
                <s-text variant="headingMd" as="h2">Conversion rate</s-text>
                <div style={{ fontSize: "28px", fontWeight: "bold", margin: "8px 0" }}>
                  0.95%
                </div>
                {/* Visual placeholder for the conversion chart */}
                <div style={{ height: "150px", background: "#f6f6f7", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <s-text tone="subdued">Chart Placeholder</s-text>
                </div>
              </div>
            </s-card>
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
            <s-table-body>{renderTableData(filteredExperiments)}</s-table-body>
          </s-table>
        </s-box>
      </s-section>
    </s-page>
  );
}
