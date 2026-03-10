import { authenticate } from "../shopify.server";
import db from "../db.server";

// Function for registering the required web pixel
export async function registerWebPixel({ request }) {
  const { admin, session } = await authenticate.admin(request);

  // First check to see if the web pixel is already registered
  const webPixelId = await getWebPixelId(session);

  if (webPixelId) {
    return new Response(
      JSON.stringify({
        message:
          "App pixel registered successfully. You can mark this step as complete!",
        action: "enableTracking",
      }),
      { status: 200 },
    );
  }

  const settings = {
    accountID: "123",
    appUrl: process.env.SHOPIFY_APP_URL,
  };

  const response = await admin.graphql(
    `#graphql
        mutation($settings: JSON!) {
        webPixelCreate(webPixel: { settings: $settings }) {
          userErrors {
            code
            field
            message
          }
          webPixel {
            settings
            id
          }
        }
      }
      `,
    {
      variables: {
        settings: settings,
      },
    },
  );

  const responseAsJSON = await response.json();
  const userErrors = responseAsJSON.data?.webPixelCreate?.userErrors ?? [];

  if (userErrors.length > 0) {
    const isTaken = userErrors.some((e) => e.code === "TAKEN");

    if (isTaken) {
      // Pixel exists on Shopify but the local DB lost the ID — recover it
      console.log(
        "Web pixel already exists on Shopify. Recovering existing ID...",
      );
      const existingId = await fetchWebPixelIdFromShopify(admin);
      if (existingId) {
        await storeWebPixelId(session, existingId);
        console.log(`Recovered and stored existing web pixel ID: ${existingId}`);
        return new Response(
          JSON.stringify({
            message:
              "App pixel registered successfully. You can mark this step as complete!",
            action: "enableTracking",
          }),
          { status: 200 },
        );
      }
    }

    console.error(
      "An error occurred while trying to register the Web Pixel App Extension:",
      userErrors,
    );
    return new Response(
      JSON.stringify({
        message:
          "App pixel was unable to register. Please check Shopify Admin -> Settings -> Customer events. If ab-insightful is already registered, mark this item as complete. Otherwise, please try again.",
        action: "enableTracking",
      }),
      { status: 500 },
    );
  }

  const newWebPixelId = responseAsJSON.data?.webPixelCreate?.webPixel?.id;
  await storeWebPixelId(session, newWebPixelId);
  console.log(`Created and stored web pixel with ID: ${newWebPixelId}`);

  return new Response(
    JSON.stringify({
      message:
        "App pixel registered successfully. You can mark this step as complete!",
      action: "enableTracking",
    }),
    { status: 200 },
  );
}

// Function for updating web pixel information
export async function updateWebPixel({ request }) {
  const { admin, session } = await authenticate.admin(request);

  let webPixelId = await getWebPixelId(session);

  // If no local ID, try to register (which also recovers existing pixels)
  if (!webPixelId) {
    await registerWebPixel({ request });
    webPixelId = await getWebPixelId(session);
  }

  if (!webPixelId) {
    console.error("Unable to obtain web pixel ID for update.");
    return new Response(
      JSON.stringify({
        message:
          "App pixel could not be updated — unable to find or create the web pixel. Try deleting ab-insightful from Shopify Admin -> Settings -> Customer events and re-registering.",
        action: "updateWebPixel",
      }),
      { status: 500 },
    );
  }

  const settings = {
    accountID: "123",
    appUrl: process.env.SHOPIFY_APP_URL,
  };

  console.log(`Updating web pixel ${webPixelId} with appUrl: ${settings.appUrl}`);

  const response = await admin.graphql(
    `#graphql
        mutation($id: ID!, $settings: JSON!) {
        webPixelUpdate(id: $id, webPixel: { settings: $settings }) {
          userErrors {
            code
            field
            message
          }
          webPixel {
            settings
            id
          }
        }
      }
      `,
    {
      variables: {
        settings: settings,
        id: webPixelId,
      },
    },
  );

  const responseAsJSON = await response.json();
  if (responseAsJSON.data?.webPixelUpdate?.userErrors?.length > 0) {
    console.error(
      "An error occurred while trying to update the Web Pixel App Extension:",
      responseAsJSON.data.webPixelUpdate.userErrors,
    );
    return new Response(
      JSON.stringify({
        message: "App pixel was unable to update.",
        action: "updateWebPixel",
      }),
      { status: 500 },
    );
  }

  const newWebPixelSettings =
    responseAsJSON.data?.webPixelUpdate?.webPixel?.settings;
  console.log(`Web pixel updated. New settings: ${newWebPixelSettings}`);
  return new Response(
    JSON.stringify({
      message: "App pixel updated successfully.",
      action: "updateWebPixel",
    }),
    { status: 200 },
  );
}

// Function for getting Web Pixel ID from database
async function getWebPixelId(session) {
  const currentSession = await db.session.findUnique({
    where: {
      id: session.id,
    },
  });
  return currentSession?.webPixelId ?? null;
}

async function storeWebPixelId(session, webPixelId) {
  await db.session.update({
    where: { id: session.id },
    data: { webPixelId },
  });
}

// Query Shopify for the existing web pixel (works without an ID since API 2023-04)
async function fetchWebPixelIdFromShopify(admin) {
  try {
    const response = await admin.graphql(
      `#graphql
        query {
          webPixel {
            id
            settings
          }
        }
      `,
    );
    const responseAsJSON = await response.json();
    return responseAsJSON.data?.webPixel?.id ?? null;
  } catch (error) {
    console.error("Failed to fetch existing web pixel from Shopify:", error);
    return null;
  }
}

async function getAppInstallationId({ request }) {
  // Authenticate first
  const { admin, session } = await authenticate.admin(request);

  // Next, perform GraphQL query to get App Install ID
  const response = await admin.graphql(
    `#graphql
       query {
        currentAppInstallation {
          id
        }
      }`,
  );
  const responseAsJSON = await response.json();

  return responseAsJSON.data.currentAppInstallation.id;
}

// Function for updating the app URL metafield. Idempotent - you do not need to create before setting. It will create if not set.
export async function updateAppUrlMetafield({ request }) {
  // Authenticate first
  const { admin, session } = await authenticate.admin(request);

  // Get app installation ID
  const appInstallationId = await getAppInstallationId({ request });

  // update metafield
  const appUrl = process.env.SHOPIFY_APP_URL;

  const response = await admin.graphql(
    `#graphql
        mutation CreateAppDataMetafield($metafieldsSetInput: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafieldsSetInput) {
            metafields {
              id
              namespace
              key
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
    {
      variables: {
        metafieldsSetInput: [
          {
            namespace: "ab-insightful",
            key: "api_url",
            type: "single_line_text_field",
            value: appUrl,
            ownerId: appInstallationId,
          },
        ],
      },
    },
  );
}
