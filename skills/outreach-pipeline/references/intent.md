# Intent MCP integration

Use Intent to write in the sender's voice after the user qualifies a lead. This contract was inspected from the live `Intent writer` MCP server, version `1.30.0`, on 2026-10-16. Refresh `tools/list` on setup and adapt to the actual schema; the server can change.

## Connection and each user's token

Keep connection/authentication separate from campaign and skill content. Each user supplies their own Intent token and the current HTTPS MCP endpoint. Reuse an already verified connection without requesting the token again. Never copy the original user's token into this skill, a CRM, a generated prompt, an example, a log, or a shareable file.

If Intent is not configured, ask the user to connect their Intent account by entering their token privately in a terminal or setting `INTENT_TOKEN` in the environment that launches Codex. Do not solicit a token in chat. If they already supplied one in this session, use it only for the intended endpoint without asking again or echoing it. A new user must not inherit another user's credential. Ask for the endpoint if absent; do not assume a temporary tunnel URL is stable.

Register with:

```sh
codex mcp add intent --url "$INTENT_MCP_URL" --bearer-token-env-var INTENT_TOKEN
```

Alternatively, use the bundled helper's `configure --url <current HTTPS endpoint>` in an interactive terminal. It privately prompts for the token (or uses `INTENT_TOKEN`), saves it in macOS Keychain under service `codex.intent.INTENT_TOKEN` and registers the server. Other platforms must supply the environment variable themselves; the helper does not persist plaintext credentials. Never put the token in command arguments. Resolve all helper paths against this skill directory.

An environment change does not update already running apps. Verify native tool availability after configuration; do not claim registration alone makes tools callable. `python3 scripts/intent_mcp.py --token-source keychain launch-codex` starts a new Codex CLI process with the saved token in its environment, without placing it in command arguments. Desktop native MCP likewise needs the token in its launch environment; never restart the user's app automatically. If native tools are unavailable in the active session, the direct helper can use the registered URL and Keychain immediately.

If environment and Keychain credentials conflict, the helper stops before any network request. Confirm which account is intended and select `--token-source keychain` or `--token-source env` explicitly. Do not silently choose an old inherited token after a credential change. Use one verified credential source consistently for the campaign and recheck the team profile after changing it.

```sh
python3 scripts/intent_mcp.py inspect
python3 scripts/intent_mcp.py call set_profile --args-file profile.json
python3 scripts/intent_mcp.py call voice_interview --args-file empty-object.json
python3 scripts/intent_mcp.py call reach_plan --args-file plan.json
python3 scripts/intent_mcp.py call write_message --args-file message.json
```

Argument files contain tool inputs only, never tokens. `--args-file -` reads a JSON object from stdin; `{}` reads the profile or requests interview questions. Use native tools when exposed; use the helper only as a transport fallback. The helper initializes MCP, lists available tools, supports JSON/SSE responses, blocks credential-forwarding redirects, and makes no automatic retries.

For HTTP 401/403, ask the user to check the account/token. For 404, verify the endpoint with them or observed server evidence; do not keep retrying authentication or alter the token. The original supplied `/mcpsvg` path returned 404; `/mcp` on that same host was successfully verified. This observation is not permission to rewrite every future URL. Never follow a redirect with the bearer token to an unapproved origin.

## Setup and data handling

Tell the user once during Intent setup: **Intent retains submitted recipient details, goals, writing samples, drafts, and outputs, and may use them to improve Intent.** Then ask for the necessary writing samples or voice answers. Use only relevant, user-provided or expressly authorized material. Do not mine the mailbox for writing samples without the user's authorization. Keep tokens out of all content sent to Intent.

Read the saved team profile using `set_profile({})` before modifying it. This empty call was verified as a read and returns `profile`, `budget`, and `data_notice`. The profile read may report a sample count rather than sample text. Do not assume it returns samples or a selectable voice/profile ID; no profile-ID parameter is exposed.

If the existing profile matches the sender/campaign, reuse it. Resolve conflicts with the user; a token can identify a team whose profile is shared. Only the main coordinator updates the profile. Never let per-lead workers switch shared profiles concurrently. If independent campaigns/senders share one token, serialize profile changes and their dependent calls, or use separately configured connections. Check matching profile state before writing; fail closed on unexpected changes.

Collect 3–10 pieces the sender actually wrote, verbatim, each at most 4,000 characters. A product brief is not automatically a writing sample. If samples are missing or AI-written, call `voice_interview({})`; it returns five questions and instructions. Ask one question at a time and preserve the user's answers verbatim, without cleanup. Its currently observed questions cover a coffee-shop pitch, explaining the problem to a friend, a memorable customer moment, misconceptions about the space, and asking for 15 minutes. Do not invent an experience if the user lacks one. Use the actual returned questions and keep interview answers separate from polished campaign summaries.

Map confirmed intake and voice material to `set_profile`:

| Argument | Campaign source | Current maximum |
| --- | --- | --- |
| `company` | Sender's company | 200 characters |
| `what_we_do` | Product/problem in the sender's natural words | 1,000 characters |
| `icp` | Ideal recipient definition | 1,000 characters |
| `offer` | Desired response / specific ask | 600 characters |
| `proof` | Verified supporting claims | 1,000 characters |
| `sender_name` | Confirmed first name for sign-off | 80 characters |
| `sender_samples` | 3–10 genuine writing samples or interview answers | 4,000 characters each |

Omitted fields preserve their existing values. Do not leave stale proof, offer, or samples from another sender/campaign in place. The current schema exposes no delete/reset operation: do not assume `null` clears a field. Resolve stale values using supported behavior and verify the resulting profile. Preserve samples exactly; ask for a shorter sample or choose another rather than silently rewriting it to fit. Confirm the prepared profile as part of the campaign summary, then save it and record its version/snapshot locally. Never save fictional test data into the user's profile.

## Planning qualified leads

Use Exa for lead discovery. Intent's `reach_plan` adds communication planning; it does not replace the Exa stage or the user's qualification decision.

For a qualified lead, choose a plain-language segment such as the role/industry in the campaign audience. `reach_plan` requires `segment` (at most 200 characters), and accepts `recipient` and `goal` (at most 1,000 characters). A recipient object requires `name`; optional fields are `role`, `company`, and `hook`, with additional grounded facts allowed.

Call once per new segment to obtain and cache a general playbook. Reuse it for matching `write_message.audience` values. When Exa evidence does not establish a suitable personal approach, optionally call again with the qualified `recipient` and `goal` for a person-specific plan. Reuse a suitable existing plan rather than researching the same person for every revision. The server describes web research, sourced hooks, an approach, reader priorities, wording, proof preferences, recommended channel, and reply guidance; inspect actual returned fields instead of assuming a fixed output schema.

The server estimates 20–60 seconds and roughly $0.10–$0.25 per plan; treat those as estimates, not guarantees. Inspect returned `budget`, stay within the agreed campaign scope, and surface depletion. Do not silently purchase credits or expand the batch. Record the plan, sources, approach, and any reported usage. New facts still require identity/evidence checks. A suggested channel does not override the user's chosen channel or authorize cross-channel contact.

## Writing one qualified lead

Call `write_message` with:

- Required `recipient`: verified `name`, plus relevant `role`, `company`, grounded `hook`, and other necessary facts. Keep source links in the CRM; do not send unrelated profile/inbox data.
- Required `goal`: the purpose and one specific ask, at most 1,000 characters.
- Required `channel`: `email` or `linkedin` for this pipeline. The tool also exposes `x_dm`, which is outside this campaign unless the user expands scope.
- `audience`: the same segment string used for the cached plan (at most 200 characters).
- `approach`: the verified framing from the plan when available (at most 600 characters).
- `variants`: default `1`; use `3` when the user requests alternatives.
- `sender_name` and `sender_samples`: omit when the verified saved profile is correct, or pass the confirmed sender's actual values explicitly. These do not override the team's company/offer/proof fields.

The tool describes messages under 90 words with one ask, no links, and no em dashes. If the campaign requires incompatible content, explain the constraint and agree on an edit/revision; do not silently drop an essential requirement. Subject to the actual server result, email outputs include a subject, and three-variant outputs include style labels.

The documented return fields are `messages`, `method`, `note`, `dropped_samples`, and `budget`. Parse the real MCP envelope first: the verified tools return JSON text within `content` blocks, with an `isError` flag. Prefer structured data if the server later exposes it. Persist the exact returned draft(s), subject(s), method/note, dropped-sample report, usage, and local input/output version. No server request-ID or idempotency-key parameter is currently exposed; use local attempt IDs without pretending they deduplicate remote calls.

The server describes a base-model drafting step and an Opus repair step; `method` may report a fallback. Treat that as reported provenance, not a guarantee of quality. If samples were dropped as AI-written, tell the user and obtain genuine samples/interview answers as needed before claiming the draft represents their voice. Validate output against the recipient, evidence, claims, and one ask. Tool errors, missing messages, or budget exhaustion are blockers, not successful drafts.

Show the exact chosen draft to the user for review. Intent writes only: it has no authority to qualify, approve, or send. Preserve every edited version and renew approval for changed content. A timeout may represent a completed and billed generation; record the uncertainty and avoid automatic repeated requests. Reconcile using any supported evidence, otherwise ask before another potentially duplicate paid call.

## Verification and unavailable integration

Setup verification can use `initialize`, `tools/list`, `set_profile({})`, and `voice_interview({})` without changing the team profile or submitting real lead data. Do not run paid recipient research, save a fictional profile, or generate test outreach merely to claim setup succeeded. Writing is verified only after a real authorized qualified-lead call succeeds.

If connection, profile/voice setup, or writing fails, save the input packet and a precise blocker such as `awaiting_intent_connection`, `awaiting_voice_samples`, or `intent_generation_failed`. Continue independent discovery and qualification. Do not label another model's draft as Intent output or silently substitute a local writer.
