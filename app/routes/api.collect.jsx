import { handleCollectedEvent } from "../services/experiment.server";

// Loader for handling OPTIONS requests
export const loader = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*", // or specific domain
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }
  return null;
};

// Action for handling POST requests
export const action = async ({ request }) => {
  // If it's an OPTIONS request, handle preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  const data = await request.json();
  console.log("Event happened:", data);

  // Don't await - need to return as possible // [ryan] I am assuming so we can service other events asap
  // but how do i surface the errors?
  handleCollectedEvent(data);

  return Response.json(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
};
