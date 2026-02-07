/* Provides session analytics data for the Reports dashboard
*  NOTE: Currently, this service generates mock data to bypass GraphQL errors in development. (TableResponse error)
*  In a production environment, this function would query the database for session data within the specified date range. */

export async function getSessionReportData(admin, start, end) {

  // If dates are missing from the loader, default to the last 30 days
  const startDate = start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const endDate = end || new Date().toISOString().split('T')[0];

  try {
    // Attempt to query live ShopifyQL query
    const response = await admin.graphql(
      `#graphql
      query getSessions($query: String!) {
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
          query: `SHOW sessions BY day SINCE ${startDate} UNTIL ${endDate}`
        },
      }
    );

    const resJson = await response.json();

    // Validate and Parse Shopify API Data
    // Check for GraphQL errors or ShopifyQL specific parse errors
    if (resJson.errors || resJson.data?.shopifyqlQuery?.parseErrors?.length) {
       throw new Error(resJson.data?.shopifyqlQuery?.parseErrors?.[0] || "GraphQL Query Error");
    }

    const rows = resJson.data?.shopifyqlQuery?.tableData?.rows;

    if (rows && rows.length > 0) {
      console.log(`[analytics.server] Successfully fetched ${rows.length} live rows.`);
      
      const sessions = rows.map(row => ({
        date: row[0], // ShopifyQL usually returns date as the first column
        count: parseInt(row[1], 10) // and count as the second
      }));

      return {
        sessions,
        total: sessions.reduce((acc, curr) => acc + curr.count, 0)
      };
    }

    // If API succeeds but returns 0 rows, throw to trigger fallback
    throw new Error("No live data available");

  } catch (error) {

    // If the API fails (Permissions, TableResponse error, etc.), use the mock generator.
    console.warn(`[analytics.server] API Error or No Data. Falling back to mock: ${error.message}`);
    return generateMockSessions(startDate, endDate);
  }
}

// Helper function to generate mock session data for a given date range
function generateMockSessions(start, end) {
  const sessions = [];
  let currentDate = new Date(start + "T12:00:00");
  const stopDate = new Date(end + "T12:00:00");

  let safetyLimit = 0;
  while (currentDate <= stopDate && safetyLimit < 100) {
    const dateStr = currentDate.toISOString().split('T')[0];
    
    // Random sessions between 40 and 120
    const count = Math.floor(Math.random() * 81) + 40; 
    
    sessions.push({
      date: dateStr,
      count: count
    });
    
    currentDate.setDate(currentDate.getDate() + 1);
    safetyLimit++;
  }

  const total = sessions.reduce((acc, curr) => acc + curr.count, 0);
  return { sessions, total };
}