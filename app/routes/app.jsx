import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";
import { DateRangeProvider } from "../contexts/DateRangeContext";


export const loader = async ({ request }) => {
  await authenticate.admin(request);

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData();

  return (
    <AppProvider 
      embedded ={true}
      apiKey={apiKey}
    >
      {/*wrapped the date range provider context around the entire app navigation, may have more precise solution later */}
      <DateRangeProvider>
        <s-app-nav>
          <s-link href="/app">Home</s-link>
          <s-link href="/app/experiments">Experiments</s-link>
          <s-link href="/app/reports"> Reports</s-link>
          <s-link href="/app/help"> Help</s-link>
          <s-link href="/app/settings">Settings</s-link>
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
