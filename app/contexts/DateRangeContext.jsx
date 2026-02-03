import { createContext, useContext, useState, useEffect } from "react";

const DateRangeContext = createContext(null);

//helper to get current date in YYYY-MM-DD format
const getCurrentDate = () => {
  return new Date().toISOString().split("T")[0];
};

//helper to get date X days ago in YYYY-MM-DD format
const getDateDaysAgo = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split("T")[0];
};

//helper to format a YYYY-MM-DD string for display without timezone issues
//parses as local time by appending T00:00:00
const formatDateForDisplay = (dateString) => {
  if (!dateString) return "";
  return new Date(dateString + "T00:00:00").toLocaleDateString();
};

export function DateRangeProvider({ children }) {
  //initialize with last 30 days as default
  const [dateRange, setDateRange] = useState(() => {
    const currentDay = getCurrentDate();
    const startDate = getDateDaysAgo(30);
    return { start: startDate, end: currentDay };
  });

  return (
    <DateRangeContext.Provider value={{ dateRange, setDateRange }}>
      {children}
    </DateRangeContext.Provider>
  );
}

export function useDateRange() {
  const context = useContext(DateRangeContext);
  if (!context) {
    throw new Error("useDateRange must be used within a DateRangeProvider");
  }
  return context;
}

//export helpers for use in components
export { getCurrentDate, getDateDaysAgo, formatDateForDisplay };
