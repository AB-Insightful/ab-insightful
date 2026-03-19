import { env } from "node:process";

export async function loader({ request }) {
  // this endpoint should not be reachable from the public internet.
  // It should only be reachable from within the fly.io internal network made up of all the machines within the fly.io app
  // 1. ensure that this request comes from the internal network.

  if (env.NODE_ENV === "development") {
    console.log("[execute-analysis] received request: ", request);
  }

  // Handle OPTIONS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        Allow: "OPTIONS, GET, HEAD",
        "Access-Control-Allow-Origin": "cron.process.ab-insightful.internal",
        "Access-Control-Allow-Methods": "OPTIONS, GET, HEAD",
        "Access-Control-Allow-Headers": "Cron-Secret, Content-Type",
      },
    });

  // Handle GET request
  } else if (request.method === "GET") {
    const authHeader = request.headers.get("Cron-Secret") ?? "";
    if (authHeader !== env.CRON_SECRET) {
      // basic header auth
      return new Response(
        JSON.stringify({
          ok: false,
          message: "Unauthorized. Please supply your CRON Secret",
        }),
        {
          status: 401,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }

    // Structured Execution & Logging
    try {
      // Execute the function
      const { createAnalysisSnapshot } = await import("../services/analysis.server");
      
      console.log("[api/cron/execute-analysis] Servicing an authorized request: ", request);
    
      const ret = await createAnalysisSnapshot();

      console.log("[api/cron/execute-analysis] Analysis Snapshot Success! Result: ", JSON.stringify(ret));
      return new Response(
        JSON.stringify({
          ok: true,
          message: "Analysis Snapshot Created",
          data: ret,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      )
    } catch (e) {
      // Log the full error stack to stderr
      console.error("[api/cron/execute-analysis] Analysis Execution Failed:");
      console.error(e.stack || e.message);
      return new Response(
        JSON.stringify({
          ok: false,
          message: "Error Creating Analysis Snapshot",
          error: e.message,
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }
    // Fallback for unathorized methods
  } else {
    return new Response(null, {
      status: 405,
    });
  }
}