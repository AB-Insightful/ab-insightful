import { env } from "node:process";

export async function loader({ request }) {
  // this endpoint should not be reachable from the public internet.
  // It should only be reachable from within the fly.io internal network made up of all the machines within the fly.io app
  // 1. ensure that this request comes from the internal network.

  if (env.NODE_ENV === "development") {
    console.log("received request: ", request);
  }
  const { createAnalysisSnapshot } = await import(
    "../services/analysis.server"
  );
  console.log("[api/cron] Servicing a request: ", request);
  const ret = await createAnalysisSnapshot();
  console.log("Executed Analysis Snapshot Creation. Result: ", ret);
  return ret;
  //2. Execute the function
  // 3. Report and log errors.
}
