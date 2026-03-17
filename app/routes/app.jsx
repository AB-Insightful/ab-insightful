import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";
import { DateRangeProvider } from "../contexts/DateRangeContext";
import { useState, useEffect } from "react";


export const loader = async ({ request }) => {
  await authenticate.admin(request);

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData();
  const [host, setHost] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setHost(params.get("host") || "");
  }, []);

  const navHref = (path) => host ? `${path}?host=${host}` : path;

  return (
    <AppProvider embedded={true} apiKey={apiKey}>
      <DateRangeProvider>
        <s-app-nav>
          <s-link href={navHref("/app")}>Home</s-link>
          <s-link href={navHref("/app/experiments")}>Experiments</s-link>
          <s-link href={navHref("/app/experiments/new")}>Create Experiment</s-link>
          <s-link href={navHref("/app/reports")}>Reports</s-link>
          <s-link href={navHref("/app/help")}>Help</s-link>
          <s-link href={navHref("/app/settings")}>Settings</s-link>
        </s-app-nav>
        <Outlet />
      </DateRangeProvider>
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
