import { env } from "node:process";
import db from "../db.server";
export async function loader({ request }) {
  if (env.NODE_ENV === "development") {
    console.log("[poll-experiments] received request: ", request);
  }
  if (request.method === "OPTIONS") {
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

    // poll for experiments
    const {
      getCandidatesForScheduledEnd,
      getCandidatesForScheduledStart,
      getCandidatesForStableSuccessEnd,
      endExperiment,
      startExperiment,
    } = await import("../services/experiment.server");
    
    const ended_experiments = await getCandidatesForScheduledEnd();
    const started_experiments = await getCandidatesForScheduledStart();
    const stable_success_experiments = await getCandidatesForStableSuccessEnd();

    // combine the ended experiments and the stable success experiments
    const all_ended_experiments = [...ended_experiments, ...stable_success_experiments];

    console.log("[Poll-Experiments] Started: ",started_experiments, "Scheduled Ends: ", ended_experiments, "Stable Success Ends: ", stable_success_experiments);
    if (all_ended_experiments.length === 0 && started_experiments.length === 0 ) {
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
      let start_results = [];
      let end_results = [];
      let failures = [];
      const { sendEmailStart } = await import("../services/notifications.server");
      const { sendEmailEnd } = await import("../services/notifications.server");
      if (started_experiments.length > 0 ) {
        for (const experiment of started_experiments) {
          console.log(experiment);
          try{
            start_results.push(await startExperiment(experiment.id));
            
            //check if starting of experiment notifications is enabled
            const project = await db.project.findUnique({
                where: { id: experiment.projectId },
                select: { enableExperimentStart: true, shop: true }
            });

            //send the email if enabled
            if (project?.enableExperimentStart) {
                await sendEmailStart(experiment.id, experiment.name, project.shop);
            }
          }catch(e){
            failures.push(`Start Experiment Failure: [${experiment.id}]: ${e.message}`);
          }
        }
      }
      if (all_ended_experiments.length > 0) {
        for (const experiment of all_ended_experiments) {
          try{
            end_results.push(await endExperiment(experiment.id));
            
            //check if ending of experiment notifications is enabled
            const project = await db.project.findUnique({
                where: { id: experiment.projectId },
                select: { enableExperimentEnd: true, shop: true }
            });

            //send the email if enabled
            if (project?.enableExperimentEnd) {
                await sendEmailEnd(experiment.id, experiment.name, project.shop);
            }
          }catch(e){
            failures.push(`End Experiment Failure: [${experiment.id}]: ${e.message}`);
          }
        }
      }
      try {
        return new Response(
          JSON.stringify({
            ok: true,
            started_experiments: started_experiments.length === 0 ? "None" : `${started_experiments}`,
            ended_experiments: all_ended_experiments.length === 0 ? "None" : `${all_ended_experiments}`,
            failures: failures 
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
    }
  } else {
    return new Response(null, {
      status: 405,
    });
  }
}
