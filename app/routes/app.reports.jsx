import { Outlet } from "react-router";
import { DateRangeProvider } from "../contexts/DateRangeContext";

/**
 * Layout route for all /app/reports/* routes.
 * Provides DateRangeContext so the selected date range persists
 * when navigating between the reports list and individual reports.
 */
export default function ReportsLayout() {
  return (
    <DateRangeProvider>
      <Outlet />
    </DateRangeProvider>
  );
}
