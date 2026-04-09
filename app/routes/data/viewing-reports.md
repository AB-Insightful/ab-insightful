# Viewing Reports

This guide introduces the reports available in AB Insightful and how to access them.

## Overview

Reports help you understand how your experiments are performing and how your store is doing overall. AB Insightful provides:

1. **Reports Overview** — A summary of all experiments
2. **Individual Experiment Reports** — Detailed analysis for each experiment
3. **Sessions & Conversions** — Store-wide metrics

## Reports Overview Page

**How to access:** Click **Reports** in the main navigation.

The Reports Overview page includes:

### Analytics Dashboard

Two cards at the top show aggregate metrics for your store:

- **Conversions** — Total conversions over time, filterable by date range. Shows how many visitors completed your conversion goals.
- **Sessions** — Total sessions over time, filterable by date range. Shows visitor activity on your store.

### Experiment Reports Table

A table lists all active and completed experiments (excluding archived). For each experiment you’ll see:

- **Experiment Name** — Click the name to open the detailed report.
- **Status** — Active, Paused, Completed, or Archived.
- **Run Length** — How long the experiment has been (or was) running.
- **End Condition** — How the experiment is set to end (e.g., end date or stable probability).
- **Conversions** — Total conversions and users (e.g., `42 / 1000`).

### Date Range Filter

Use the date range picker to filter the Sessions and Conversions cards. The selected range applies when you open individual experiment reports as well.

### Pagination

If you have many experiments, use the pagination controls to move between pages of the table.

## Individual Experiment Reports

**How to access:** From the Reports Overview, click an experiment name in the table. Or go to **Reports** and select the experiment from the list.

Each experiment report includes:

### Recommended Course of Action

A banner at the top summarizes the app’s recommendation, such as:

- **Deployable** — A variant is winning and ready to deploy.
- **Continue Testing** — Keep the experiment running for more data.
- **Inconclusive** — The experiment ended without a clear winner.
- **Draft** — The experiment is not yet active.

### Experiment Details

- **Primary Goal** — The conversion goal for this experiment.
- **Section ID** — The theme section being tested.
- **Start Date** — When the experiment started.
- **Segment** — Filter results by All, Mobile, or Desktop visitors.

### Status & Actions

- View and change experiment status (Start, Pause, Resume, End, Archive).
- **Edit Experiment** — Opens the experiment edit page (disabled when the experiment is completed or archived).

### Variant Comparison Table

A table comparing each variant (Control and variants) with:

- **Goal Completion Rate** — Conversion rate for each variant.
- **Improvement** — Improvement vs. baseline (Control).
- **Probability of Being Best** — Statistical likelihood that this variant is the best performer.
- **Expected Loss** — Risk of choosing this variant if it’s not actually the best.
- **Conversions** — Raw counts (e.g., conversions / users).

### Charts

- **Probability of Being Best Over Time** — How each variant’s probability of being best has changed over the experiment’s run.
- **Expected Loss Over Time** — How expected loss has changed for each variant.

Charts respect the date range selected in the date range picker.

## Quick Reference

| Report Type        | Location                    | What It Shows                          |
|--------------------|-----------------------------|----------------------------------------|
| Reports Overview   | **Reports** in nav          | All experiments, sessions, conversions |
| Experiment Report | Click experiment name       | Detailed variant analysis & charts     |
| Sessions           | Reports Overview (card)     | Store sessions over time               |
| Conversions        | Reports Overview (card)     | Store conversions over time           |

For a deeper explanation of the metrics and how to interpret them, see **Understanding Your Results**.
