# Creating & Managing Experiments

This guide covers what an experiment is, how to create one, and how to manage experiments throughout their lifecycle.

## What is an Experiment?

An **experiment** (or A/B test) is a controlled comparison between two or more versions of something on your store. In AB Insightful, experiments typically compare:

- **Control** — The original version (baseline)
- **Variants** — One or more alternative versions you want to test

Visitors are randomly assigned to see either the control or a variant. The app tracks how many people in each group complete your chosen **conversion goal** (e.g., add to cart, purchase, sign up). Over time, statistical analysis determines which variant is most likely to perform best and whether the results are reliable enough to act on.

### Key Concepts

- **Section ID** — Each variant (including the control) is tied to a theme section on your store. You provide the section ID so the app knows which content to show.
- **Conversion Goal** — The action you want visitors to take (e.g., a specific goal you define in the app).
- **Traffic Allocation** — The percentage of visitors who see each variant (e.g., 50% control, 50% variant).
- **End Condition** — How the experiment ends: either on a specific date or when a variant reaches a stable probability of being best.

## How to Create an Experiment

1. **Go to Create Experiment** — Click **Create Experiment** in the main navigation.

2. **Name and Description** — Give your experiment a clear name and optional description so you can identify it later.

3. **Define Variants** — For each variant (including the control):
   - Enter the **Section ID** from your Shopify theme. This identifies which theme section to use.
   - Set the **Traffic Allocation** (percentage of visitors who see this variant). Total allocation across all variants should typically add up to 100%.

4. **Set the Conversion Goal** — Choose the goal that defines a successful conversion (e.g., add to cart, purchase).

5. **Choose an End Condition**:
   - **End Date** — The experiment stops on a specific date and time.
   - **Stable Success Probability** — The experiment runs until a variant reaches a target probability of being best for a specified duration.

6. **Schedule the Start** — Set the start date and time. The start must be in the future.

7. **Submit** — Review your settings and create the experiment. It will start in **Draft** status until you start it.

## Managing Experiments

### Experiment Statuses

Experiments move through these statuses:

- **Draft** — Created but not yet running. You can edit and then start when ready.
- **Active** — Running and collecting data.
- **Paused** — Temporarily stopped. No new data is collected while paused.
- **Completed** — Ended (by date or end condition). No further changes.
- **Archived** — Kept for reference but no longer active.

### Common Actions

- **Start** — Begin a draft experiment so it starts collecting data.
- **Pause** — Temporarily stop an active experiment.
- **Resume** — Restart a paused experiment.
- **End** — Manually end an active experiment and mark it as completed.
- **Archive** — Move a completed experiment to the archived list.
- **Rename** — Change the experiment name (when allowed by status).
- **Delete** — Remove an experiment (typically only for drafts or when appropriate).

### Where to Manage

- **Experiments page** — View all experiments, filter by status, and perform bulk actions.
- **Individual experiment page** — Edit experiment details (when not locked).
- **Report page** — Change status (e.g., pause, end) from the experiment’s report view.

### Best Practices

- Use clear, descriptive names so you can find experiments later.
- Ensure your theme sections and section IDs are correct before starting.
- Let experiments run long enough to collect meaningful data before ending them.
- Use the Reports section to monitor progress and follow the app’s recommendations.

For more on interpreting results, see **Understanding Your Results**.
