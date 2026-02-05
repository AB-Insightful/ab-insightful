import { useState, useEffect, useMemo } from "react";
import { useDateRange } from "../contexts/DateRangeContext"; // Context for consistency
import { 
  LineChart, Line, XAxis, YAxis, 
  Tooltip, ResponsiveContainer 
} from "recharts";
import { useAppBridge } from "@shopify/app-bridge-react";
import { Redirect } from "@shopify/app-bridge/actions";

export default function SessionsCard({ sessionData }) {
  const app = useAppBridge();
  const redirect = useMemo(() => Redirect.create(app), [app]);
  
  // Access the global date range (Consistency check)
  const { dateRange } = useDateRange();

  // Client-only rendering to prevent SSR hydration mismatch
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

  const { sessions, total } = sessionData || { sessions: [], total: 0 };

  // This ensures the chart matches the DateRangePicker selection
  const filteredData = useMemo(() => {
    if (!sessions.length || !dateRange) return sessions;

    return sessions
      .filter((item) => {
        const itemDate = new Date(item.date);
        // Normalize dates to ensure accurate comparison
        const startDate = new Date(dateRange.start + "T00:00:00");
        const endDate = new Date(dateRange.end + "T23:59:59");
        return itemDate >= startDate && itemDate <= endDate;
      })
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [sessions, dateRange]);

  // Redirect logic
  const handleFullReport = () => {
    redirect.dispatch(
      Redirect.Action.ADMIN_PATH, 
      '/reports/sessions_over_time'
    );
  };

  return (
    <s-card>
      <div style={{ padding: "16px" }}>
        {/* Title atop the card */}
        <s-text variant="headingMd" as="h2">Sessions</s-text>
        
        <div style={{ fontSize: "28px", fontWeight: "bold", margin: "8px 0" }}>
          {total.toLocaleString()}
        </div>

        {/* Graphical Form */}
        <div style={{ height: "150px", width: "100%" }}>
          {isClient ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={filteredData}>
                <Line 
                  type="monotone" 
                  dataKey="count" 
                  stroke="#008060" 
                  strokeWidth={2} 
                  dot={false} 
                />
                <XAxis dataKey="date" hide />
                <YAxis hide domain={['auto', 'auto']} />
                <Tooltip /> 
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ textAlign: "center", paddingTop: "60px" }}>
              <s-text tone="subdued">Loading chart...</s-text>
            </div>
          )}
        </div>

        {/* Full Report button in bottom-right */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "16px" }}>
          <s-button onClick={handleFullReport}>
            Full Report
          </s-button>
        </div>
      </div>
    </s-card>
  );
}