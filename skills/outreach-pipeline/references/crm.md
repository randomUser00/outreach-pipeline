# Markdown CRM operations

Read this reference when creating, resuming, or updating a campaign CRM. Copy [the template](../assets/crm-template.md) to the campaign's working directory for a new CRM; reuse an existing campaign CRM when identified. Do not store campaign data inside the installed skill. Preserve existing records and user edits.

## One writer, continuous coordination

Start a CRM subagent during intake. It creates or inspects the file while the main agent gathers the brief, then remains the sole agent writing that CRM during the active run. Give it the absolute path and send campaign answers and lead events as they arrive. Research, Intent, send, and monitoring agents return events rather than editing the file. If subagents are unavailable, the main agent fills the same role and explains the reduced parallelism.

The writer acknowledges each persisted event. Await acknowledgment before an action whose correctness depends on that event, especially sending. Reread before each update; apply a focused change, retaining unrelated user edits. Deduplicate events using stable event IDs. On restart or writer handoff, stop the previous writer, read saved state, reconcile unfinished actions, and designate exactly one successor. A subagent is active only while the runtime supports it; persistent monitoring requires a separately verified schedule.

## Five visible columns

Keep the summary table limited to these columns:

| Column | Meaning |
| --- | --- |
| Name | Link the person's display name to a stable lead-detail anchor such as `#lead-0001`. |
| Email / LinkedIn | Evidence-backed address and/or profile URL. Use “Not found” when unavailable; do not invent an address. |
| Reached out | `Yes` only after a confirmed outbound message; otherwise `No`. An uncertain send remains `No` with an explicit “outcome unknown—reconcile before retry” detail and pending action. |
| Qualified | `—` until the user decides; `Yes` or `No` records that decision. Research recommendations do not change this value. |
| Read message | `Yes` or `No` only when supported by an explicit recipient-read indicator for the latest confirmed outbound message; otherwise `Unknown`. Sender mailbox read/unread flags and missing receipts are not recipient-read evidence. |

The summary spans the campaign: reached out means at least one confirmed send across its channels. Track each channel separately below the table. Name the message and channel to which a read indicator applies; reset the summary read value to `Unknown` on a new send unless its own read state is known. Record replies separately, without inventing read receipts.

## Lead details and event records

Create one detail section per lead with a stable heading (`### lead-0001`). Include:

- Identity and company; source URLs with observed timestamps; normalized dedup keys; verified contact route and verification evidence.
- Fit evidence, exclusions checked, research recommendation, and the user's qualification decision with time and rationale when given.
- Stage, next action, responsible agent, and blockers. Useful stages: discovered, awaiting qualification, qualified, awaiting Intent, draft ready, approved, sending, sent, replied, closed; rejection, bounce, and do-not-contact are distinct outcomes.
- Intent handoff: confirmed profile version, audience/approach, input and generation attempt IDs, exact returned variants/subjects, reported method, dropped samples, budget, and errors. Store no token.
- Channel history: sender account, recipient, draft version, exact subject/body, user approval for that version, send outcome, provider message/thread IDs or observed browser conversation URL, and timestamps.
- Monitoring evidence and last checked time; pending follow-ups; do-not-contact decisions.

Use ISO 8601 timestamps with UTC offsets and record the campaign timezone. Keep exact approved text in the file or a linked local versioned message file; never replace it silently. A change to message content, recipient, sender, or channel invalidates the corresponding approval. Store no passwords, session cookies, or authentication tokens.

Each incoming event should identify event ID, campaign, lead ID (if applicable), event type, observed time, actor/source, changed facts, and evidence or decision reference. Record it once in the event log, then update details and the table consistently. Link bulky evidence rather than copying whole inboxes or pages.

Deduplicate by normalized email and canonical LinkedIn profile URL. Preserve email local-part spelling and use the provider's identity rules where known; do not strip dots or plus tags universally. Normalize URL tracking parameters. Similar names or companies alone are not enough to merge people. Check known prior contact and exclusions before proposing a fresh send.

## Sending and recovery

1. Require the user's qualification and approval of the actual message, recipient, sender, and channel. A lead approval is not a send approval.
2. Assign an attempt ID; persist a `send-intent` event with that approval and exact message version. Wait for the writer's acknowledgment before invoking Gmail or clicking Send in the browser.
3. Persist the confirmed result and available provider identifiers. Only then set `Reached out = Yes`.
4. If interrupted, timed out, or ambiguous, record `outcome unknown` and reconcile the sent folder or browser conversation before retrying. If reconciliation cannot establish the outcome, leave the attempt blocked for user review. Do not retry solely because the summary still says `No`.

Record replies, bounces, and explicit read indicators from actual channel evidence. A reply cancels pending follow-ups until reviewed; an opt-out stops further outreach to that recipient. Sending follow-ups still requires approval of their actual text. At turn end, persist pending work, last checks, and whether a real scheduler is active so a later run can resume honestly.
