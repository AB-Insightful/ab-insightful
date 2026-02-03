import { useState } from "react";
import {
  useDateRange,
  getCurrentDate,
  getDateDaysAgo,
  formatDateForDisplay,
} from "../contexts/DateRangeContext";

export default function DateRangePicker({ onDateRangeChange }) {
  const { dateRange, setDateRange } = useDateRange();
  const [tempDateRange, setTempDateRange] = useState(null);

  //handle preset date range selection (7 or 30 days)
  const handleDateRangeChange = (value) => {
    const currentDay = getCurrentDate();
    let newDateRange;

    if (value === "7") {
      const startDate = getDateDaysAgo(7);
      newDateRange = { start: startDate, end: currentDay };
    } else if (value === "30") {
      const startDate = getDateDaysAgo(30);
      newDateRange = { start: startDate, end: currentDay };
    }

    if (newDateRange) {
      setDateRange(newDateRange);
      onDateRangeChange?.(newDateRange);
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
      onDateRangeChange?.(tempDateRange);
    }
  };

  return (
    <div style={{ marginRight: "16px" }}>
      <s-button
        commandFor="date-range-popover"
        icon="calendar"
        accessibilityLabel="Select date range"
      >
        {dateRange
          ? `${formatDateForDisplay(dateRange.start)} - ${formatDateForDisplay(dateRange.end)}`
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
  );
}
