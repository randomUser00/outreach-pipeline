# Lead review app

A small Next.js page for qualifying one batch of leads, one card at a time. Swipe right or press **D** to accept, swipe left or press **A** to reject, swipe up or press **W** to defer, and press **S** to undo the last decision. Arrow keys work too. Each card has an optional note.

To restyle it, change the variables at the top of `app/globals.css`.

## Run a batch

1. Copy this folder into the campaign folder, for example `<campaign>/review/batch-2/`. Never run it inside the downloaded skill directory.
2. Write `data/leads.json` in the shape of `data/leads.example.json`, using verified candidate records only.
3. `npm ci`, then `npm run dev -- -p <port>`, and open `http://localhost:<port>`.

## Data

`data/leads.json` (written by the coordinator, read by the app):

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | CRM lead ID |
| `name` | yes | Full name |
| `headline` | yes | Credentials, role and organization |
| `segment` | yes | Segment from the brief |
| `email` | no | Verified address, or `null` |
| `linkedin` | no | Verified profile URL, or `null` |
| `fit` | no | Why they may fit, from the evidence |
| `uncertainty` | no | Material uncertainties; omit or start with "none" to hide |
| `sourceUrls` | yes | Evidence URLs (may be empty) |

The app writes only two files, and never the CRM:

- `data/decisions.json`: the current decision per lead ID, as `{ decision: "accept" | "reject" | "defer", note, decidedAt }`.
- `data/decisions-log.jsonl`: one line per click, in order. Undo appears as `"decision": "cleared"`.

The coordinator reads these and relays each decision to the CRM owner. Reload the page to pick up leads added to `leads.json` while the batch is being reviewed.
