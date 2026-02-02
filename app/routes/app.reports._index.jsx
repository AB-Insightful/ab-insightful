import { useState, useEffect } from "react";
import { useLoaderData } from "react-router";
import { formatRuntime } from "../utils/formatRuntime.js";

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

  //state variables
  const [dateRange, setDateRange] = useState(null);
  const [tempDateRange, setTempDateRange] = useState(null);
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

  //function to retrieve the current date
  const getCurrentDate = () => {
    return new Date().toISOString().split("T")[0];
  };

  //input a number of days, retrieve days ago based on current day
  const getDateDaysAgo = (days) => {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().split("T")[0];
  };

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

  //handle date range selection
  const handleDateRangeChange = (value) => {
    const currentDay = getCurrentDate();
    if (value === "7") {
      const startDate = getDateDaysAgo(7);
      const newDateRange = { start: startDate, end: currentDay };
      setDateRange(newDateRange);
      setFilteredExperiments(filterByDateRange(startDate, currentDay));
    } else if (value === "30") {
      const startDate = getDateDaysAgo(30);
      const newDateRange = { start: startDate, end: currentDay };
      setDateRange(newDateRange);
      setFilteredExperiments(filterByDateRange(startDate, currentDay));
    }
  };

  //handle custom date picker change (store data temporarily)
  const handleDatePickerChange = (event) => {
    const value = event.target.value;
    if (value && value.includes("--")) {
      const [start, end] = value.split("--");
      setTempDateRange({ start, end });
    }
  };

  //handle save button click (apply the date range)
  const handleSaveDateRange = () => {
    if (tempDateRange) {
      setDateRange(tempDateRange);
      setFilteredExperiments(
        filterByDateRange(tempDateRange.start, tempDateRange.end),
      );
    }
  };

  //initialize with last 30 days
  useEffect(() => {
    const currentDay = getCurrentDate();
    const startDate = getDateDaysAgo(30);
    setDateRange({ start: startDate, end: currentDay });
    setFilteredExperiments(filterByDateRange(startDate, currentDay));
  }, [experiments]);

  return (
    <s-page heading="Reports">
      {/* custom date range popover */}
      <div style={{ marginRight: "16px" }}>
        <s-button
          commandFor="date-range-popover"
          icon="calendar"
          accessibilityLabel="Select date range"
        >
          {dateRange
            ? `${new Date(dateRange.start).toLocaleDateString()} - ${new Date(dateRange.end).toLocaleDateString()}`
            : "Select date range"}
        </s-button>
        <s-popover id="date-range-popover">
          <div style={{ display: "flex" }}>
            {/* left side - 30 days, 7 days */}
            <div
              style={{
                width: "120px",
                padding: "12px",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}
            >
              <s-button
                variant="tertiary"
                alignment="start"
                onClick={() => handleDateRangeChange("7")}
                commandFor="date-range-popover"
              >
                Last 7 days
              </s-button>
              <s-button
                variant="tertiary"
                alignment="start"
                onClick={() => handleDateRangeChange("30")}
                commandFor="date-range-popover"
              >
                Last 30 days
              </s-button>
            </div>

            {/* right side - calendar + buttons */}
            <div>
              <s-date-picker type="range" onChange={handleDatePickerChange} />

              {/* confirm/cancel buttons */}
              <div
                style={{
                  padding: "12px",
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "8px",
                }}
              >
                <s-button commandFor="date-range-popover" variant="secondary">
                  Cancel
                </s-button>
                <s-button
                  onClick={handleSaveDateRange}
                  commandFor="date-range-popover"
                  variant="primary"
                >
                  Apply
                </s-button>
              </div>
            </div>
          </div>
        </s-popover>
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
            <s-table-body>{renderTableData(filteredExperiments)}</s-table-body>
          </s-table>
        </s-box>
      </s-section>
      <s-page heading="Reports" variant="headingLg"></s-page>
    </s-page>
  );
}
