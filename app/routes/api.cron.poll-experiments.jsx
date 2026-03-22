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
    console.log(started_experiments, ended_experiments);
    if (ended_experiments.length === 0 && started_experiments.length === 0) {
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
      const { sendEmailStart, sendSMSEnd, sendSMSStart } = await import("../services/notifications.server");
      const { sendEmailEnd } = await import("../services/notifications.server");
      if (started_experiments.length > 0 ) {
        for (const experiment of started_experiments) {
          console.log(experiment);
          try{
            start_results.push(await startExperiment(experiment.id));
            
            //check if starting of experiment notifications is enabled
            const project = await db.project.findUnique({
                where: { id: experiment.projectId },
                select: { enableExperimentStart: true, emailNotifEnabled: true, smsNotifEnabled: true,  shop: true }
            });

            //send the email and sms if enabled
            if (project?.enableExperimentStart && project?.emailNotifEnabled) {
                await sendEmailStart(experiment.id, experiment.name, project.shop);
            }
            if (project?.enableExperimentStart && project?.smsNotifEnabled)
            {
              await sendSMSStart(experiment.id, experiment.name, project.shop);
            }
          }catch(e){
            failures.push(e.message);
          }
        }
      }
      if (ended_experiments.length > 0) {
        for (const experiment of ended_experiments) {
          try{
            end_results.push(await endExperiment(experiment.id));
            
            //check if ending of experiment notifications is enabled
            const project = await db.project.findUnique({
                where: { id: experiment.projectId },
                select: { enableExperimentEnd: true,  emailNotifEnabled: true, smsNotifEnabled: true,  shop: true }
            });

            //send the email and sms once experiment completes if enabled in settings
            if (project?.enableExperimentEnd && project?.emailNotifEnabled) {
                await sendEmailEnd(experiment.id, experiment.name, project.shop);
            }
            if (project?.enableExperimentEnt && project?.smsNotifEnabled)
            {
              await sendSMSEnd(experiment.id, experiment.name, project.shop);
            }
          }catch(e){
            failures.push(e.message);
          }
        }
      }
      try {
        return new Response(
          JSON.stringify({
            ok: true,
            started_experiments: started_experiments.length === 0 ? "None" : `${started_experiments}`,
            ended_experiments: ended_experiments.length === 0 ? "None" : `${ended_experiments}`,
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
