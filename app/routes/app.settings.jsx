//imports
import { authenticate } from "../shopify.server";
import { useLoaderData, useFetcher } from "react-router";
import db from "../db.server";

//loader for the default goal
export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const project = await db.project.findUnique({
    where: { shop: session.shop },
    select: { defaultGoal: true },
  });
  return { defaultGoal: project?.defaultGoal ?? "completedCheckout" };
};

//write updated experiment goal to database
export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  //retrieve and parse data
  const formData = await request.formData();
  const defaultGoal = (formData.get("defaultGoal") || "").trim();
  //update or create default goal in database
  await db.project.upsert({
    where: { shop: session.shop },
    update: { defaultGoal },
    create: { shop: session.shop, name: `${session.shop} Project`, defaultGoal },
  });
};

export default function Settings() {
  const { defaultGoal } = useLoaderData();
  const fetcher = useFetcher();

  return (
    <s-page heading="App Settings">
      <s-section heading="Experiment Configuration">
        <fetcher.Form method="post">
          <s-stack direction="block" gap="base">
            <s-select
              label="Select a new default goal for creating new experiments"
              name="defaultGoal"
              value={defaultGoal}
              //NOTE: this on change element will need to be modified when a dedicated save button is implemented for the settings page
              onChange={(e) =>
                fetcher.submit(
                  { defaultGoal: e.target.value },
                  { method: "post" }
                )
              }
            >
              <s-option value="completedCheckout">Completed Checkout</s-option>
              <s-option value="viewPage">Viewed Page</s-option>
              <s-option value="startCheckout">Started Checkout</s-option>
              <s-option value="addToCart">Added Product to Cart</s-option>
            </s-select>
          </s-stack>
        </fetcher.Form>
      </s-section>
      <s-section heading="Support & Documentation">
        <s-link href="/app/help">How To's and Support</s-link>
      </s-section>
      <s-section heading="Language">
        <s-select name="language">
            <s-option value="English">English</s-option>
        </s-select>
      </s-section>
    </s-page>
  );
}