//imports
import { authenticate } from "../shopify.server";
import { useLoaderData, useFetcher } from "react-router";
import { useEffect, useRef } from "react";
import db from "../db.server";

//loader for the default goal
export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const project = await db.project.findUnique({
    where: { shop: session.shop },
    select: { defaultGoal: true },
  });

    //import for tutorial data
  const { getTutorialData } = await import ("../services/tutorialData.server");
  const tutorialInfo = await getTutorialData();

  return { defaultGoal: project?.defaultGoal ?? "completedCheckout", 
           tutorialData: tutorialInfo
  };
};

//write updated experiment goal to database
export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  //retrieve and parse data
  const formData = await request.formData();
  const defaultGoal = (formData.get("defaultGoal") || "").trim();
  const intent = (formData.get("intent"));

  //updates tutorial data on button click when relevant
  //update or create default goal in database

  if(intent === "defaultGoalSet")
  {
    await db.project.upsert({
    where: { shop: session.shop },
    update: { defaultGoal },
    create: { shop: session.shop, name: `${session.shop} Project`, defaultGoal },
    });

  }
  if(intent === "tutorial_viewed")
  {
    try {
        const { setGeneralSettings } = await import("../services/tutorialData.server");
        await setGeneralSettings(1, true); //always sets the item in tutorialdata to true, selects 1st tuple
        return {ok: true, action: "tutorial_viewed"}; 
      } catch (error) {
        console.error("Tutorial Error:", error);
        return {ok: false, error: "Failed to update viewedListExperiment"}, { status: 500};
      }
  }

  return { ok: false, error: "unknown intent"};
};



export default function Settings() {
  const { defaultGoal, tutorialData } = useLoaderData();
  const fetcher = useFetcher();
  const tutorialFetcher = useFetcher(); // for tutorial actions
  const modalRef = useRef(null);

  useEffect(() => {
  //displays tutorialData when scenario met
    if ((tutorialData.generalSettings == false) && modalRef.current && typeof modalRef.current.showOverlay === 'function') {
        modalRef.current.showOverlay();
    }
  }, [tutorialData]);
  return (
    <s-page heading="App Settings">

      <s-modal
            id="tutorial-modal-settings"
            ref={modalRef}
            heading="Quick tour"
            padding="base"
            size="base"
      >
        <s-stack gap="base">
          <s-paragraph>
            Here is some tutorial information.
          </s-paragraph>
        
            <s-button
            variant="primary"
            inLineSize = "fill"
            commandFor="tutorial-modal-settings"
            command="--hide"
            onClick = {() => {
              tutorialFetcher.submit(
                { intent: "tutorial_viewed"},
                {method: "post"}
              )
            }}
            > Understood. Do not show this again.
            </s-button>
        </s-stack>
      </s-modal>
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
                  {intent: "defaultGoalSet", defaultGoal: e.target.value},
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