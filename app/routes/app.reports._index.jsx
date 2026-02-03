import { useState, useEffect } from "react";
import { useLoaderData } from "react-router";
import { formatRuntime } from "../utils/formatRuntime.js";
import { useDateRange } from "../contexts/DateRangeContext";
import DateRangePicker from "../components/DateRangePicker";

//server side code
export async function loader() {
  //get the list of experiments & return them if there are any
  const { getExperimentsList1 } = await import("../services/experiment.server");
  const experiments = await getExperimentsList1();
  if (experiments) {
    return experiments;
  }
  return null;
}

export default function Reports() {
  //get list of experiments
  const experiments = useLoaderData();

  //get date range from context
  const { dateRange } = useDateRange();

  //state for filtered experiments
  const [filteredExperiments, setFilteredExperiments] = useState(experiments);

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
  };

  //filter experiments when dateRange from context changes or experiments load
  useEffect(() => {
    if (dateRange && experiments) {
      setFilteredExperiments(filterByDateRange(dateRange.start, dateRange.end));
    }
  }, [dateRange, experiments]);

  return (
    <s-page heading="Reports">
      {/* date range picker component */}
      <DateRangePicker onDateRangeChange={handleDateRangeChange} />
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
            <s-table-body>{renderTableData(filteredExperiments)}</s-table-body>
          </s-table>
        </s-box>
      </s-section>
      <s-page heading="Reports" variant="headingLg"></s-page>
    </s-page>
  );
}
