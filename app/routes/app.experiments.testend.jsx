import {
  handleCollectedEvent,
  manuallyEndExperiment,
} from "../services/experiment.server";

export const loader = async () => {
  const experimentId = 2003; // Pick an experiment ID to alter

  const before = await handleCollectedEvent({
    timestamp: new Date().toISOString(),
    experimentId,
    event_type: "dev_test_before",
  });

  const ended = await manuallyEndExperiment(experimentId);

  const after = await handleCollectedEvent({
    timestamp: new Date().toISOString(),
    experimentId,
    event_type: "dev_test_after",
  });

  const body = JSON.stringify({
    experimentId,
    before,
    endedStatus: ended.status,
    after,
  });

  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
