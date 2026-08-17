# Outreach Outcomes and Learning Loop

## Model

Successful audited sends create an `OutreachOutcome` linked to startup, outreach audit, optional tracking record, score tier, funding stage, team range, signal types, outreach mode, contribution type, and build-before-ask status. Mutable outcome fields cover reply state/classification, follow-up count, interview, technical task, referral, rejection, offer, and notes.

Reply categories are `interested`, `maybe`, `referral`, `wrong_person`, `rejected`, and `no_response`. Outcomes are user-classified; email opens do not imply replies or interest.

## Follow-ups

The recommendation cadence is Day 4, Day 10, and Day 21 after the initial send. A recommendation is returned only when its scheduled time has passed, no reply is recorded, and fewer than three follow-ups exist.

Each recommendation contains a value-oriented angle and `requiresApproval: true`. It never sends email and avoids the empty “just following up” formulation. Replied conversations stop recommendations.

## Analytics

Analytics computes overall reply and positive-reply rates plus slices by startup tier, funding stage, team size, signal type, outreach mode, contribution type, and build-before-ask usage. Every slice includes `n` and both raw counts and rates.

Samples below five are labeled insufficient for interpretation. Larger samples are still described as associations, never causal effects. Interviews, tasks, referrals, rejections, offers, built opportunities, and converted built opportunities are explicit counts.

## Learning suggestions

The engine may produce a suggested adjustment only from groups with at least five observations. Suggestions cite the rate and sample size and always require human approval. They do not mutate Phase 3 weights or thresholds.

## UI and API

The Analytics dashboard adds reply, positive-reply, interview, built, conversion, follow-up, and learning cards alongside existing open telemetry. `/api/outcomes` lists outcomes, due recommendations, and analytics; PATCH validates manual outcome updates. The existing `/api/analytics` response includes the same learning view for the current dashboard.

## Safety and limitations

No mailbox-reading scope was added, so reply classification is manual. Follow-ups are recommendations only. Opens remain approximate telemetry. Analytics is descriptive and does not automatically change scoring. All state uses the existing authenticated Upstash persistence boundary.
