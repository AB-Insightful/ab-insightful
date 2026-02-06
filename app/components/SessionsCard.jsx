import { useState, useEffect } from "react"; 
import PropTypes from "prop-types";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function SessionsCard({ sessionData }) {
  // Recharts requires the window object to calculate dimensions
  // We use this state variable to ensure the chart only renders on the client side
  // to prevent hydration errors in server-side rendering environments
  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);

  // Safely destructure sessions and total from sessionData, providing defaults to prevent errors if sessionData is undefined
  const { sessions, total } = sessionData || { sessions: [], total: 0 };

  const handleFullReport = () => {
    // Cleaner navigation to the native Shopify Analytics report 
    // Uses the shopify:// protocol to ensure navigation happens within the Admin Frame
    window.open('shopify://admin/analytics/reports/sessions_over_time', '_top');
  };

  return (
    <s-card>
      <div style={{ padding: "24px" }}>
        <s-text variant="headingMd" as="h2" style={{ color: "#616161", marginBottom: "4px" }}>Sessions</s-text>
        
        <div style={{ fontSize: "32px", fontWeight: "600", marginBottom: "20px", color: "#202223" }}>
          {total.toLocaleString()}
        </div>

        {/* Chart Container with White Background */}
        <div style={{ 
          background: "#ffffff", 
          borderRadius: "12px", 
          padding: "20px 10px 10px 10px", 
          border: "1px solid #ebebeb",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)" 
        }}>
          <div style={{ height: "250px", width: "100%" , minHeight: "250px", position: "relative"}}>
            {isClient ? (
              <ResponsiveContainer width="100%" height="100%" minWidth="0px">
                <AreaChart data={sessions} debounce={50} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorSessions" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#008060" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="#008060" stopOpacity={0.01}/>
                    </linearGradient>
                  </defs>
                  
                  {/* Grid lines pop against the white background */}
                  <CartesianGrid vertical={false} stroke="#f0f0f0" />
                  
                  <XAxis 
                    dataKey="date" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#8c9196', fontSize: 11 }}
                    dy={10}
                    minTickGap={40}
                    tickFormatter={(str) => {
                      const date = new Date(str);
                      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    }}
                  />
                  
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#8c9196', fontSize: 11 }}
                  />
                  
                  <Tooltip 
                    contentStyle={{ 
                      borderRadius: "8px", 
                      border: "1px solid #ebebeb", 
                      boxShadow: "0px 4px 12px rgba(0,0,0,0.08)" 
                    }}
                  /> 
                  
                  <Area 
                    type="monotone" 
                    dataKey="count" 
                    stroke="#008060" 
                    strokeWidth={2.5}
                    fillOpacity={1} 
                    fill="url(#colorSessions)" 
                    activeDot={{ r: 5, fill: "#008060", strokeWidth: 2, stroke: "#fff" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ textAlign: "center", paddingTop: "100px" }}>
                <s-text tone="subdued">Loading chart data...</s-text>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "24px" }}>
          <button 
            onClick={handleFullReport}
            style={{ 
              background: "#303030", 
              color: "white", 
              border: "none", 
              padding: "10px 20px", 
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: "500",
              fontSize: "14px"
            }}
          >
            Full Report
          </button>
        </div>
      </div>
    </s-card>
  );
}

// Fixes the 'missing in props validation' error from the linter
SessionsCard.propTypes = {
  sessionData: PropTypes.shape({
    sessions: PropTypes.arrayOf(
      PropTypes.shape({
        date: PropTypes.string,
        count: PropTypes.number,
      })
    ),
    total: PropTypes.number,
  }),
};