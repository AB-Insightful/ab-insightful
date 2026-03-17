# Understanding Your Results

This guide explains how to read the reports and draw conclusions from your A/B tests.

## Reading the Report

When you open an experiment report, you’ll see several key metrics and visualizations. Here’s what they mean and how to use them.

## Key Metrics Explained

### Goal Completion Rate

**What it is:** The percentage of visitors who completed your conversion goal for each variant.

**How to read it:** A higher rate means more conversions per visitor. Compare each variant to the Control (baseline). A variant with a noticeably higher rate may be performing better, but you should also check statistical significance (see below).

### Improvement

**What it is:** The percentage improvement in conversion rate compared to the Control (baseline).

**How to read it:**
- **Positive** — The variant is converting better than the Control.
- **Negative** — The variant is converting worse than the Control.
- **Baseline** — Shown for the Control; other variants are compared to it.

Improvement alone doesn’t tell you if the result is reliable. Use it together with Probability of Being Best and Expected Loss.

### Probability of Being Best (PoB)

**What it is:** A Bayesian statistic estimating how likely each variant is to be the true best performer.

**How to read it:**
- **≥ 80%** — Strong evidence this variant is the best. Often considered “deployable.”
- **20–80%** — Unclear; more data is needed.
- **≤ 20%** — Unlikely to be the best; probably not worth deploying.

The app uses an 80% threshold for its “Deployable” recommendation. A variant with PoB ≥ 80% and a meaningful improvement over Control is typically ready to deploy.

### Expected Loss

**What it is:** The expected loss in conversion rate if you choose this variant but it’s not actually the best.

**How to read it:**
- **Low (e.g., &lt; 1%)** — Low risk; safe to deploy if other metrics support it.
- **High (e.g., &gt; 1%)** — Higher risk; you might lose conversions if you deploy this variant.

Expected Loss helps you weigh the upside (improvement) against the downside (risk of being wrong).

### Conversions (Raw Counts)

**What it is:** The number of conversions and total users for each variant (e.g., `42 / 1000`).

**How to read it:** More users generally mean more reliable statistics. Very small samples can produce noisy results. Let experiments run long enough to collect sufficient data.

## The Recommended Course of Action

The report shows a banner with a recommended action. Typical states:

| Recommendation   | Meaning                                                                 |
|------------------|-------------------------------------------------------------------------|
| **Deployable**   | A variant has PoB ≥ 80% and positive improvement. Consider deploying it.|
| **Continue Testing** | No clear winner yet, or a variant hit 80% before but needs more stability. Keep the experiment running. |
| **Inconclusive** | The experiment ended without a clear winner. Consider running a new test or changing the test. |
| **Draft**        | The experiment is not active. Start it to begin collecting data.         |

Use this as a starting point, but also review the full table and charts before making a decision.

## Reading the Charts

### Probability of Being Best Over Time

This chart shows how each variant’s Probability of Being Best has changed over the experiment’s run.

**What to look for:**
- **Rising toward 80%** — A variant is strengthening as the best option.
- **Stable above 80%** — Strong, consistent evidence; good candidate to deploy.
- **Flat or crossing lines** — No clear winner; more data may be needed.
- **Dropping below 20%** — This variant is likely not the best.

### Expected Loss Over Time

This chart shows how expected loss has changed for each variant over time.

**What to look for:**
- **Decreasing expected loss** — Confidence is increasing; risk is going down.
- **Low and stable** — Safe to consider deploying if PoB supports it.
- **High or rising** — Be cautious; deploying could be risky.

## Drawing Conclusions

### When to Deploy a Variant

Consider deploying when:

1. **Probability of Being Best ≥ 80%** for the variant.
2. **Improvement is positive** and meaningful for your business.
3. **Expected Loss is low** (e.g., &lt; 1%).
4. The experiment has run long enough to collect a reasonable sample size.

### When to Keep Testing

Keep the experiment running when:

1. No variant has reached 80% PoB.
2. A variant hit 80% before but the recommendation says “Continue Testing” for stability.
3. Lines in the charts are still moving or crossing; results aren’t stable yet.

### When Results Are Inconclusive

If the experiment ends without a clear winner:

1. Review sample size — Was there enough traffic?
2. Consider a longer run — Extend the next test if possible.
3. Revisit the test — Maybe test a different change or a larger effect.
4. Check segments — Results can differ by device (mobile vs. desktop); use the segment filter to explore.

## Segment Filtering

You can filter results by **All**, **Mobile**, or **Desktop**. Use this to:

- See if a winner on “All” is driven mainly by mobile or desktop.
- Decide whether to deploy a variant for all visitors or only certain segments.

## Best Practices

1. **Don’t stop too early** — Let experiments run long enough for statistics to stabilize.
2. **Use multiple metrics** — Combine PoB, improvement, and expected loss when deciding.
3. **Follow the recommendation** — The app’s recommendation is a useful guide, but use your judgment for your specific business.
4. **Document decisions** — Note why you deployed, paused, or ended an experiment for future reference.

For more on creating and managing experiments, see **Creating & Managing Experiments**. For an overview of where to find reports, see **Viewing Reports**.
