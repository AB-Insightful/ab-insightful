import { apiVersion } from "../shopify.server";

/**
 * Fetches session data from Shopify Analytics using ShopifyQL.
 * Fulfills ET-445 by providing daily timeseries data for the Recharts component.
 */
export async function getSessionReportData(admin) {
  // We use TIMESERIES to get a row for every day in the period
  // This satisfies the "graphical form over a length of specified time" requirement
  const shopifyQL = "FROM sessions SHOW count() TIMESERIES day DURING last_30_days";

  const query = `
    query getSessionAnalytics($query: String!) {
      shopifyqlQuery(query: $query) {
        __typename
        ... on TableResponse {
          tableData {
            rowData
            columns {
              name
              dataType
            }
          }
        }
        ... on QueryError {
          errorMessage
        }
      }
    }
  `;

  try {
    const response = await admin.graphql(query, {
      variables: { query: shopifyQL },
    });

    const responseJson = await response.json();
    const result = responseJson.data.shopifyqlQuery;

    // Handle ShopifyQL Syntax or Permission errors
    if (result?.__typename === "QueryError") {
      console.error("ShopifyQL Error:", result.errorMessage);
      return { sessions: [], total: 0 };
    }

    // Transform rowData into Recharts format: [{ date: '...', count: ... }]
    // ShopifyQL rowData is an array of arrays: [["2026-01-01", 150], ["2026-01-02", 200]]
    const sessions = result.tableData.rowData.map((row) => ({
      date: row[0], // The 'day' column from ShopifyQL
      count: Number(row[1]), // The 'count()' column
    }));

    // Calculate total sessions for the card metric
    const total = sessions.reduce((acc, curr) => acc + curr.count, 0);

    return { 
      sessions, 
      total 
    };

  } catch (error) {
    // API call fail case
    console.error("Failed to retrieve sessions from Shopify API:", error);
    return { 
      sessions: [], 
      total: 0 
    };
  }
}