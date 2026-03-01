import { env } from "node:process";
export async function loader({ request }) {
  if (env.NODE_ENV === "development") {
    console.log("[poll-experiments] received request: ", request);
  }
  if (request.method === "OPTIONS") {
    console.log("hit options");
    return new Response(null, {
      status: 204,
      headers: {
        Allow: "OPTIONS, GET, HEAD",
        // only allow requests that originate from the internal network, from the cron process
        "Access-Control-Allow-Origin": "cron.process.ab-insightful.internal",
        "Access-Control-Allow-Methods": "OPTIONS, GET, HEAD", // do not allow POST or other write operations
        "Access-Control-Allow-Headers": "Cron-Secret, Content-Type", // using a key for basic header auth. Requests should have Cron-Secret else reject
      },
    });
  } else if (request.method === "GET") {
    // handle the job
    const authHeader = request.headers.get("Cron-Secret") ?? "";
    const origin =
      env.NODE_ENV == "development"
        ? env.ORIGIN
        : (request.headers.get("Origin") ?? "");
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
    if (
      origin !==
      (env.NODE_ENV == "development"
        ? env.ORIGIN
        : "cron.process.ab-insightful.internal")
    ) {
      // ensure requests come from fly's internal network.
      return new Response(
        JSON.stringify({
          ok: false,
          message:
            "Only internal Requests are allowed. It's bad that you are seeing this.",
        }),
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
    const { endExperiment } = await import("../services/experiment.server");
    const { startExperiment } = await import("../services/experiment.server");
    const ended_experiments = await getCandidatesForScheduledEnd();
    const started_experiments = await getCandidatesForScheduledStart();
    if (!ended_experiments && !started_experiments) {
      // refactor opp: can remove this if statement and just return the else response, but do i want the distinct messaging?
      try {
        return new Response(
          JSON.stringify({
            ok: true,
            message: "No experiments needed to be started or ended",
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      } catch (e) {
        console.error(e);
      }
    } else {
      // left here. these if statements need to be cleaned up
      if (started_experiments) {
        for (const experiment in started_experiments) {
          await startExperiment(experiment.id);
        }
      }
      if (ended_experiments) {
        for (const experiment in ended_experiments) {
          await endExperiment(experiment.id);
        }
      }
      try {
        return new Response(
          JSON.stringify({
            ok: true,
            start_experiments: started_experiments,
            end_experiments: ended_experiments,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application.json",
            },
          },
        );
      } catch (e) {
        console.error(e);
      }
    }
  } else {
    return new Response(null, {
      status: 405,
    });
  }
}
