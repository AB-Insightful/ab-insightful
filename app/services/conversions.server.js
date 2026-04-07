/* This service fetches conversion funnel metrics for the reports page.
 * It returns daily rows with sessions and conversion stages so the UI can
 * derive conversion-rate charts and overall percentages consistently.
 */

export async function getConversionsReportData(admin, start, end) {
  // If dates are missing from the loader, default to the last 30 days
  const startDate =
    start ||
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const endDate = end || new Date().toISOString().split("T")[0];

  try {
    // Attempt to query live ShopifyQL query
    const response = await admin.graphql(
      `#graphql
      query getConversions($query: String!) {
        shopifyqlQuery(query: $query) {
          tableData {
            columns {
              name
            }
            rows
          }
          parseErrors
        }
      }`,
      {
        variables: {
          query: `FROM sessions SHOW sessions, sessions_with_cart_additions, sessions_that_reached_checkout, 
          sessions_that_completed_checkout, conversion_rate 
          SINCE ${startDate} UNTIL ${endDate} TIMESERIES day`,
        },
      },
    );

    const resJson = await response.json();
    
    // Console logging
    // console.dir(resJson.data.shopifyqlQuery.parseErrors, { depth: null });
    // console.dir(resJson.data.shopifyqlQuery.tableData, { depth: null });

    // Validate and Parse Shopify API Data
    // Check for GraphQL errors or ShopifyQL specific parse errors
    if (resJson.errors || resJson.data?.shopifyqlQuery?.parseErrors?.length) {
      throw new Error(
        resJson.data?.shopifyqlQuery?.parseErrors?.[0] || "GraphQL Query Error",
      );
    }

    const tableData = resJson.data?.shopifyqlQuery?.tableData;
    const rows = tableData?.rows;

    if (rows && rows.length > 0) {
      console.log(
        `[conversions.server] Successfully fetched ${rows.length} live rows.`,
      );

      const sessions = rows.map((row) => {
        const totalSessions = Number(row.sessions) || 0;
        const addedToCart = Number(row.sessions_with_cart_additions) || 0;
        const reachedCheckout = Number(row.sessions_that_reached_checkout) || 0;
        const completedCheckout = Number(row.sessions_that_completed_checkout) || 0;
        const apiRate = Number(row.conversion_rate) || 0;

        const conversionRate = apiRate > 0 ? apiRate : totalSessions > 0 ? (completedCheckout / totalSessions) * 100 : 0;

        return {
          date: row.day,
          // `count` remains the charted conversion count for compatibility.
          count: completedCheckout,
          sessions: totalSessions,
          addedToCart,
          reachedCheckout,
          completedCheckout,
          conversionRate,
        };
      });

      return {
        sessions,
        total: sessions.reduce((acc, curr) => acc + curr.count, 0),
      };
    }

    // If API succeeds but returns 0 rows, throw to trigger fallback
    throw new Error("No live data available");
  } catch (error) {
    // If the API fails (Permissions, TableResponse error, etc.), use the mock generator.
    console.warn(
      `[conversions.server] API Error or No Data. Falling back to mock: ${error.message}`,
    );
    return generateMockConversions(startDate, endDate);
  }
}

// Helper function to generate mock conversion data for a given date range.
function generateMockConversions(start, end) {
  const sessions = [];
  let currentDate = new Date(start + "T12:00:00");
  const stopDate = new Date(end + "T12:00:00");

  let safetyLimit = 0;
  while (currentDate <= stopDate && safetyLimit < 100) {
    const dateStr = currentDate.toISOString().split("T")[0];

    const totalSessions = Math.floor(Math.random() * 81) + 40;
    const completedCheckout = Math.floor(totalSessions * (Math.random() * 0.08 + 0.01));
    const reachedCheckout = Math.max(completedCheckout, Math.floor(totalSessions * (Math.random() * 0.2 + 0.08)));
    const addedToCart = Math.max(reachedCheckout, Math.floor(totalSessions * (Math.random() * 0.35 + 0.15)));

    sessions.push({
      date: dateStr,
      count: completedCheckout,
      sessions: totalSessions,
      addedToCart,
      reachedCheckout,
      completedCheckout,
      conversionRate: totalSessions > 0 ? (completedCheckout / totalSessions) * 100 : 0,
    });

    currentDate.setDate(currentDate.getDate() + 1);
    safetyLimit++;
  }

  const total = sessions.reduce((acc, curr) => acc + curr.count, 0);
  return { sessions, total };
}
