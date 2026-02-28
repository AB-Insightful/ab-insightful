import { env } from "node:process";
export async function loader({ request }) {
  if (env.NODE_ENV === "development") {
    console.log("received request: ", request);
  }
  if (request.headers.get("Request-Method") === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        Allow: "OPTIONS, GET, HEAD",
        // only allow requests that originate from the internal network, from the cron process
        "Access-Control-Allow-Origin": "cron.process.ab-insightful.internal",
        "Access-Control-Allow-Methods": "OPTIONS, GET, HEAD", // do not allow POST or other write operations
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
      },
    });
  } else if (request.headers.get("Request-Method") === "GET") {
    const authHeader = request.headers.get("Authorization") ?? "";
    const origin = request.headers.get("Origin") ?? "";
    if (authHeader !== env.CRON_SECRET) {
      // TODO create mechanism for creating the secret.
      return new Response(
        {
          message: "Unauthorized. Please supply your CRON Secret",
        },
        {
          status: 401,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }
    if (origin !== "cron.process.ab-unsightful.internal") {
      // TODO put into environment and pass in
      return new Response(
        {
          message: "can't touch this.",
        },
        {
          status: 403,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }
    // poll for experiments
    const { getCandidatesForScheduledEnd } = await import(
      "../services/experiment.server"
    );
    const { getCandidatesForScheduledStart } = await import(
      "../services/experiment.server"
    );
    const ended_experiments = await getCandidatesForScheduledEnd();
    const started_experiments = await getCandidatesForScheduledStart();
    if (!ended_experiments && !started_experiments) {
      return new Response(
        {
          message: "No experiments needed to be started or ended",
        },
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    } else {
      return new Response(
        {
          message: `Started Experiments: ${started_experiments ?? "None"}\n Ended Experiments: ${ended_experiments ?? "None"}`,
        },
        {
          status: 200,
          headers: {
            "Content-Type": "application.json",
          },
        },
      );
    }
  }
}
