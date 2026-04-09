import { GetFrontendExperimentsData } from "../services/experiment.server";

export const loader = async ({ request }) => {
  if (request.method === "OPTIONS") {
    const origin = request.headers.get("Origin") ?? "";
    const request_method =
      request.headers.get("Access-Control-Request-Method") ?? "POST";
    const request_headers =
      request.headers.get("Access-Control-Request-Headers") ?? "";

    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin, // or specific domain
        "Access-Control-Allow-Methods": `${request_method}, OPTIONS`,
        "Access-Control-Allow-Headers": request_headers || "Content-Type",
        "Access-Control-Allow-Private-Network": "true",
      },
    });
  } else if (request.method === "GET") {
    const origin = request.headers.get("Origin") ?? "";
    const request_method =
      request.headers.get("Access-Control-Request-Method") ?? "GET";
    const request_headers =
      request.headers.get("Access-Control-Request-Headers") ?? "";
    const experiments = await GetFrontendExperimentsData();

    if (!experiments || experiments.length === 0) {
      return new Response(
        JSON.stringify({
          error: "No active experiments were found",
        }),
        {
          status: 404,
          headers: {
            "Access-Control-Allow-Origin": origin, // or specific domain
            "Access-Control-Allow-Methods": `${request_method}, OPTIONS`,
            "Access-Control-Allow-Headers": request_headers || "Content-Type",
            "Access-Control-Allow-Private-Network": "true",
          },
        },
      );
    }

    return new Response(JSON.stringify(experiments), {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": origin, // or specific domain
        "Access-Control-Allow-Methods": `${request_method}, OPTIONS`,
        "Access-Control-Allow-Headers": request_headers || "Content-Type",
        "Access-Control-Allow-Private-Network": "true",
      },
    });
  }
  return null;
};
