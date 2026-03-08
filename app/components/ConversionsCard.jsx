import { useState, useEffect, useMemo } from "react";
import PropTypes from "prop-types";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const getShopSlug = (shop) => {
  if (!shop || typeof shop !== "string") {
    return "";
  }

  return shop.replace(".myshopify.com", "").trim();
};

const buildFullReportQuery = (dateRange) => {
  const during = dateRange?.start && dateRange?.end ? `${dateRange.start}..${dateRange.end}` : "today";

  return [
    "FROM sessions",
    "SHOW sessions, sessions_with_cart_additions, sessions_that_reached_checkout, sessions_that_completed_checkout, conversion_rate",
    "WHERE human_or_bot_session IN ('human', 'bot')",
    "TIMESERIES day WITH TOTALS, PERCENT_CHANGE, CURRENCY 'USD'",
    `DURING ${during}`,
    "ORDER BY day ASC",
    "LIMIT 1000",
    "VISUALIZE conversion_rate TYPE line",
  ].join(" ");
};

export default function ConversionsCard({
  conversionsData,
  sessionData,
  hasExperiments,
  hasAnalysisData,
  shop,
  dateRange,
}) {
  // Recharts requires the window object to calculate dimensions
  // We use this state variable to ensure the chart only renders on the client side
  // to prevent hydration errors in server-side rendering environments
  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);

  const conversionSessions = useMemo(
    () => conversionsData?.sessions || [],
    [conversionsData],
  );
  const trafficSessions = useMemo(
    () => sessionData?.sessions || [],
    [sessionData],
  );

  const chartData = useMemo(() => {
    if (!hasExperiments) {
      return [];
    }

    const trafficByDate = new Map();
    for (const row of trafficSessions) {
      trafficByDate.set(row.date, Number(row.count) || 0);
    }

    const allDates = Array.from(new Set([
      ...trafficSessions.map((row) => row.date),
      ...conversionSessions.map((row) => row.date),
    ])).sort((a, b) => new Date(a) - new Date(b));

    return allDates.map((date) => {
      const sessions = trafficByDate.get(date) || 0;
      const conversionRow = conversionSessions.find((row) => row.date === date);
      const conversions = Number(conversionRow?.count) || 0;
      const rate = sessions > 0 ? (conversions / sessions) * 100 : 0;

      return {
        date,
        conversionRate: Number(rate.toFixed(2)),
      };
    });
  }, [conversionSessions, trafficSessions, hasExperiments]);

  const totalConversions = conversionSessions.reduce((acc, curr) => acc + (Number(curr.count) || 0), 0);
  const totalSessions = trafficSessions.reduce((acc, curr) => acc + (Number(curr.count) || 0), 0);
  const conversionRate = hasExperiments && totalSessions > 0 ? (totalConversions / totalSessions) * 100 : 0;

  const handleFullReport = () => {
    const fallbackShop = window?.shopify?.config?.shop;
    const shopSlug = getShopSlug(shop || fallbackShop);

    if (!shopSlug) {
      return;
    }

    const params = new URLSearchParams({
      ql: buildFullReportQuery(dateRange),
    });

    const url = `https://admin.shopify.com/store/${shopSlug}/analytics/reports/conversion_rate_over_time?${params.toString()}`;
    window.open(url, "_top");
  };

  if (!hasAnalysisData) {
    return (
      <s-card>
        <div style={{ padding: "24px" }}>
          <s-text variant="headingMd" as="h2" style={{ color: "#616161", marginBottom: "4px" }}>Conversion rate</s-text>
          <div style={{ fontSize: "32px", fontWeight: "600", marginBottom: "20px", color: "#202223" }}>
            0.00%
          </div>
          <s-text tone="subdued">
            No reporting data is available yet. Once analysis data exists, the conversion chart will appear here.
          </s-text>

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
                fontSize: "14px",
              }}
            >
              Full Report
            </button>
          </div>
        </div>
      </s-card>
    );
  }

  return (
    <s-card>
      <div style={{ padding: "24px" }}>
        <s-text variant="headingMd" as="h2" style={{ color: "#616161", marginBottom: "4px" }}>Conversions</s-text>
        
        <div style={{ fontSize: "32px", fontWeight: "600", marginBottom: "20px", color: "#202223" }}>
          {conversionRate.toFixed(2)}%
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
                <AreaChart data={chartData} debounce={50} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorConversions" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2c6ecb" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#2c6ecb" stopOpacity={0.02}/>
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
                    tickFormatter={(value) => `${value}%`}
                  />
                  
                  <Tooltip 
                    formatter={(value) => [`${Number(value).toFixed(2)}%`, "Conversion Rate"]}
                    contentStyle={{ 
                      borderRadius: "8px", 
                      border: "1px solid #ebebeb", 
                      boxShadow: "0px 4px 12px rgba(0,0,0,0.08)" 
                    }}
                  /> 
                  
                  <Area 
                    type="monotone" 
                    dataKey="conversionRate" 
                    stroke="#2c6ecb" 
                    strokeWidth={2.5}
                    fillOpacity={1} 
                    fill="url(#colorConversions)" 
                    activeDot={{ r: 5, fill: "#2c6ecb", strokeWidth: 2, stroke: "#fff" }}
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
ConversionsCard.propTypes = {
  conversionsData: PropTypes.shape({
    sessions: PropTypes.arrayOf(
      PropTypes.shape({
        date: PropTypes.string,
        count: PropTypes.number,
      })
    ),
    total: PropTypes.number,
  }),
  sessionData: PropTypes.shape({
    sessions: PropTypes.arrayOf(
      PropTypes.shape({
        date: PropTypes.string,
        count: PropTypes.number,
      })
    ),
    total: PropTypes.number,
  }),
  hasExperiments: PropTypes.bool,
  hasAnalysisData: PropTypes.bool,
  shop: PropTypes.string,
  dateRange: PropTypes.shape({
    start: PropTypes.string,
    end: PropTypes.string,
  }),
};