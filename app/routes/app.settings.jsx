//imports
import { authenticate } from "../shopify.server";
import { useLoaderData, useFetcher } from "react-router";
import { useEffect, useState } from "react";
import db from "../db.server";

//loader for default goal, contact email and contact phone
export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const project = await db.project.upsert({
    where: { shop: session.shop },
    update: {},
    create: { shop: session.shop, name: `${session.shop} Project`, defaultGoal: "completedCheckout" },
    select: {
      defaultGoal: true,
      contactEmails: { select: { id: true, email: true } },
      contactPhones: { select: { id: true, phoneNumber: true } },
    },
  });
  return {
    defaultGoal: project.defaultGoal,
    contactEmails: project.contactEmails,
    contactPhones: project.contactPhones,
  };
};

//actions
export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  //update the experiment goal
  if (intent === "updateDefaultGoal") {
    const defaultGoal = (formData.get("defaultGoal") || "").trim();
    await db.project.upsert({
      where: { shop: session.shop },
      update: { defaultGoal },
      create: { shop: session.shop, name: `${session.shop} Project`, defaultGoal },
    });
    return { ok: true, intent: "updateDefaultGoal", defaultGoal };
  }

  //add an email to the list
  if (intent === "addEmail") {
    const email = (formData.get("email") || "").trim().toLowerCase();

    //check if empty
    if (!email) return { error: "Email cannot be null", field: "email" };
    //check entry matches format xxx@xxx.xxx
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return { error: "Please enter a valid email (e.g. user@example.com)", field: "email" };

    //locate the project
    const project = await db.project.findUnique({
      where: { shop: session.shop },
      select: { id: true },
    });

    //check if duplicate
    const existing = await db.contactEmail.findFirst({
      where: { projectId: project.id, email },
    });
    if (existing) return { error: "Provided email is already saved", field: "email" };

    await db.contactEmail.create({ data: { email, projectId: project.id } });
    return { ok: true };
  }

  //delete an email from the list
  if (intent === "deleteEmail") {
    const id = parseInt(formData.get("id"), 10);
    await db.contactEmail.delete({ where: { id } });
    return { ok: true };
  }

  //add a phone number to the list
  if (intent === "addPhone") {
    const rawPhone = (formData.get("phone") || "").trim();

    //check if empty
    if (!rawPhone) return { error: "Phone number cannot be null", field: "phone" };
    //check entry matches format xxx-xxx-xxxx (assuming extensions not supported for now)
    const phoneRegex = /^\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{4}$/;
    if (!phoneRegex.test(rawPhone)) return { error: "Please enter a valid phone number (e.g. 555-555-5555)", field: "phone" };

    //digits only
    const phoneNumber = rawPhone.replace(/\D/g, "");

    //locate the project
    const project = await db.project.findUnique({
      where: { shop: session.shop },
      select: { id: true },
    });

    //check if duplicate
    const existing = await db.contactPhone.findFirst({
      where: { projectId: project.id, phoneNumber },
    });
    if (existing) return { error: "Provided phone number is already saved", field: "phone" };

    await db.contactPhone.create({ data: { phoneNumber, projectId: project.id } });
    return { ok: true };
  }

  //delete a phone number from the list
  if (intent === "deletePhone") {
    const id = parseInt(formData.get("id"), 10);
    await db.contactPhone.delete({ where: { id } });
    return { ok: true };
  }

  //error state
  return { error: "Unknown intent.", field: null };
};

//format 10-digit string as XXX-XXX-XXXX to be displayed on chips
function formatPhone(digits) {
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return digits;
}

export default function Settings() {
  const { defaultGoal, contactEmails, contactPhones } = useLoaderData();
  const fetcher = useFetcher();
  const goalFetcher = useFetcher();

  //input
  const [emailInput, setEmailInput] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [selectedDefaultGoal, setSelectedDefaultGoal] = useState(defaultGoal);
  const [savedDefaultGoal, setSavedDefaultGoal] = useState(defaultGoal);
  const [showGoalSaveSuccess, setShowGoalSaveSuccess] = useState(false);
  const [isGoalSaveHovered, setIsGoalSaveHovered] = useState(false);
  const [isGoalSavePressed, setIsGoalSavePressed] = useState(false);
  //chip id on hover
  const [hoveredEmailId, setHoveredEmailId] = useState(null);
  const [hoveredPhoneId, setHoveredPhoneId] = useState(null);
  //errors from fetcher response
  const emailError = fetcher.data?.field === "email" ? fetcher.data.error : null;
  const phoneError = fetcher.data?.field === "phone" ? fetcher.data.error : null;

  const hasPendingGoalChanges = selectedDefaultGoal !== savedDefaultGoal;
  const isSavingGoal = goalFetcher.state !== "idle";

  useEffect(() => {
    setSelectedDefaultGoal(defaultGoal);
    setSavedDefaultGoal(defaultGoal);
  }, [defaultGoal]);

  useEffect(() => {
    if (
      goalFetcher.state === "idle" &&
      goalFetcher.data?.ok &&
      goalFetcher.data?.intent === "updateDefaultGoal"
    ) {
      setSavedDefaultGoal(goalFetcher.data.defaultGoal);
      setSelectedDefaultGoal(goalFetcher.data.defaultGoal);
      setShowGoalSaveSuccess(true);
    }
  }, [goalFetcher.state, goalFetcher.data]);

  useEffect(() => {
    if (hasPendingGoalChanges) {
      setShowGoalSaveSuccess(false);
    }
  }, [hasPendingGoalChanges]);

  //handler functions
  const handleAddEmail = () => {fetcher.submit({ intent: "addEmail", email: emailInput }, { method: "post" });};
  const handleDeleteEmail = (id) => {fetcher.submit({ intent: "deleteEmail", id: String(id) }, { method: "post" });};
  const handleAddPhone = () => {fetcher.submit({ intent: "addPhone", phone: phoneInput }, { method: "post" });};
  const handleDeletePhone = (id) => {fetcher.submit({ intent: "deletePhone", id: String(id) }, { method: "post" });};
  const handleSaveDefaultGoal = () => {
    if (!hasPendingGoalChanges || isSavingGoal) return;
    goalFetcher.submit(
      { intent: "updateDefaultGoal", defaultGoal: selectedDefaultGoal },
      { method: "post" },
    );
  };

  return (
    <s-page heading="App Settings">

      {/*notification settings*/}
      <s-section heading="Notification Settings">

        {/*email*/}
        <s-stack direction="block" gap="small">
          <s-stack direction="inline" gap="small" alignItems="end">
            <s-box inlineSize="300px">
              <s-email-field
                label="Email"
                placeholder="username@example.com"
                value={emailInput}
                onInput={(e) => setEmailInput(e.target.value)}
                error={emailError ?? undefined}
              />
            </s-box>
            <s-button
              variant="primary"
              onClick={handleAddEmail}
              disabled={fetcher.state !== "idle"}
            >
              Save
            </s-button>
          </s-stack>

          {/*email chips*/}
          {contactEmails.length > 0 && (
            <s-stack direction="inline" gap="extraSmall" wrap>
              {contactEmails.map((entry) => (
                <s-clickable-chip
                  key={entry.id}
                  onClick={() => handleDeleteEmail(entry.id)}
                  onMouseEnter={() => setHoveredEmailId(entry.id)}
                  onMouseLeave={() => setHoveredEmailId(null)}
                >
                  <span style={{ position: "relative", display: "inline-block" }}>
                    <span style={{ visibility: "hidden" }}>
                      {entry.email.length > "Delete".length ? entry.email : "Delete"}
                    </span>
                    <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {hoveredEmailId === entry.id ? "Delete" : entry.email}
                    </span>
                  </span>
                </s-clickable-chip>
              ))}
            </s-stack>
          )}
        </s-stack>

        {/*phone*/}
        <s-stack direction="block" gap="small">
          <s-stack direction="inline" gap="small" alignItems="end">
            <s-box inlineSize="300px">
              <s-text-field
                label="Phone Number"
                placeholder="555-555-5555"
                value={phoneInput}
                onInput={(e) => setPhoneInput(e.target.value)}
                error={phoneError ?? undefined}
              />
            </s-box>
            <s-button
              variant="primary"
              onClick={handleAddPhone}
              disabled={fetcher.state !== "idle"}
            >
              Save
            </s-button>
          </s-stack>

          {/*phone chips*/}
          {contactPhones.length > 0 && (
            <s-stack direction="inline" gap="extraSmall" wrap>
              {contactPhones.map((entry) => (
                <s-clickable-chip
                  key={entry.id}
                  onClick={() => handleDeletePhone(entry.id)}
                  onMouseEnter={() => setHoveredPhoneId(entry.id)}
                  onMouseLeave={() => setHoveredPhoneId(null)}
                >
                  <span style={{ position: "relative", display: "inline-block" }}>
                    <span style={{ visibility: "hidden" }}>
                      {formatPhone(entry.phoneNumber).length > "Delete".length ? formatPhone(entry.phoneNumber) : "Delete"}
                    </span>
                    <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {hoveredPhoneId === entry.id ? "Delete" : formatPhone(entry.phoneNumber)}
                    </span>
                  </span>
                </s-clickable-chip>
              ))}
            </s-stack>
          )}
        </s-stack>

      </s-section>

      {/*experiment configuration*/}
      <s-section heading="Experiment Configuration">
        <div>
          <s-stack direction="block" gap="base">
            <s-select
              label="Select a new default goal for creating new experiments"
              name="defaultGoal"
              value={selectedDefaultGoal}
              onChange={(e) => setSelectedDefaultGoal(e.target.value)}
            >
              <s-option value="completedCheckout">Completed Checkout</s-option>
              <s-option value="viewPage">Viewed Page</s-option>
              <s-option value="startCheckout">Started Checkout</s-option>
              <s-option value="addToCart">Added Product to Cart</s-option>
            </s-select>
            <s-stack direction="inline" gap="small" alignItems="center">
              <s-button
                variant="primary"
                disabled={!hasPendingGoalChanges || isSavingGoal}
                onClick={handleSaveDefaultGoal}
                onMouseEnter={() => setIsGoalSaveHovered(true)}
                onMouseLeave={() => {
                  setIsGoalSaveHovered(false);
                  setIsGoalSavePressed(false);
                }}
                onMouseDown={() => setIsGoalSavePressed(true)}
                onMouseUp={() => setIsGoalSavePressed(false)}
                style={{
                  opacity: isGoalSaveHovered ? "0.95" : "1",
                  transform: isGoalSavePressed ? "translateY(1px)" : "translateY(0)",
                  transition: "opacity 120ms ease, transform 120ms ease",
                }}
              >
                Save
              </s-button>
              {showGoalSaveSuccess ? <s-text tone="success">Save success!</s-text> : null}
            </s-stack>
          </s-stack>
        </div>
      </s-section>

      {/*support & Documentation*/}
      <s-section heading="Support & Documentation">
        <s-link href="/app/help">How To's and Support</s-link>
      </s-section>

      {/*language*/}
      <s-section heading="Language">
        <s-select name="language">
          <s-option value="English">English</s-option>
        </s-select>
      </s-section>

    </s-page>
  );
}