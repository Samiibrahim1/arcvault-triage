# ArcVault Triage Pipeline

Agentic workflow that ingests unstructured B2B support messages, classifies and enriches them with an LLM, routes them to the correct queue, and writes structured JSON output.

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- A free [Groq](https://console.groq.com/) account and API key

## Setup

```bash
# 1. Clone the repo
git clone https://github.com/Samiibrahim1/arcvault-triage.git
cd arcvault-triage

# 2. Install dependencies
npm install

# 3. Set your Groq API key
export GROQ_API_KEY=your_key_here
```

## Running the Pipeline (batch mode)

```bash
npm run batch
```

Reads from `inputs.json`, processes each message, and writes results to `output.json`.

Example terminal output:

```
Processing 5 messages...

✓ msg_001 → Bug Report (0.90) [Engineering] [Medium]
✓ msg_002 → Feature Request (0.90) [Product] [Low]
✓ msg_003 → Billing Issue (0.90) [Billing] [Medium]
✓ msg_004 → Technical Question (0.90) [Engineering] [Low]
✓ msg_005 → Incident/Outage (0.90) [IT/Security] [High]  ⚠ keyword:stopped_loading, keyword:multiple_users_affected

Wrote 5 records to output.json
```

## Other Commands

```bash
npm start       # Start the Express API server (for deployment)
npm run batch   # Batch mode — process inputs.json → output.json
npm test        # Run unit tests (escalation + routing logic)
npm run lint    # Lint src/ with ESLint
npm run format  # Format all files with Prettier
```

## Live API

The pipeline is deployed at **https://arcvault-triage.onrender.com**

No setup or API key needed — just run the curl commands below.

---

### Health check
```bash
curl https://arcvault-triage.onrender.com/
```
```json
{ "status": "ok", "service": "arcvault-triage" }
```

---

### Triage a single message
```bash
curl -X POST https://arcvault-triage.onrender.com/triage \
  -H "Content-Type: application/json" \
  -d '{
    "id": "msg_001",
    "source": "Email",
    "raw_message": "I keep getting a 403 error when logging in since your last update."
  }'
```

**Response:**
```json
{
  "id": "msg_001",
  "source": "Email",
  "raw_message": "I keep getting a 403 error when logging in since your last update.",
  "category": "Bug Report",
  "confidence": 0.9,
  "priority": "Medium",
  "core_issue": "The customer is experiencing a 403 error when logging in after the last update.",
  "urgency_signal": "single user blocked",
  "summary": "A user is unable to log in due to a 403 error that started after the latest update...",
  "queue": "Engineering",
  "entities": { "company": null, "product": null, "user": null, "error_codes": ["403"], "other": {} },
  "escalate": false,
  "escalation_reasons": []
}
```

---

### Triage all 5 sample messages at once
```bash
curl -X POST https://arcvault-triage.onrender.com/triage/batch \
  -H "Content-Type: application/json" \
  -d '[
    {"id":"msg_001","source":"Email","raw_message":"Hi, I tried logging in this morning and keep getting a 403 error. My account is arcvault.io/user/jsmith. This started after your update last Tuesday."},
    {"id":"msg_002","source":"Web Form","raw_message":"We would love to see a bulk export feature for our audit logs. We are a compliance-heavy org and this would save us hours every month."},
    {"id":"msg_003","source":"Support Portal","raw_message":"Invoice #8821 shows a charge of $1,240 but our contract rate is $980/month. Can someone look into this?"},
    {"id":"msg_004","source":"Email","raw_message":"Is there a way to set up SSO with Okta? We are evaluating switching our auth provider."},
    {"id":"msg_005","source":"Web Form","raw_message":"Your dashboard stopped loading for us around 2pm EST. Checked our end it is definitely on yours. Multiple users affected."}
  ]'
```

Returns an array of all 5 enriched and routed records.

---

### Run the API server locally
```bash
npm start
```

## Deploying to Render

1. Sign up at [render.com](https://render.com)
2. Click **New Web Service** → connect your GitHub repo
3. Render auto-detects `render.yaml` — no manual config needed
4. Add `GROQ_API_KEY` as an environment variable in the Render dashboard
5. Deploy

## Project Structure

```
arcvault-triage/
├── src/
│   ├── index.js            # Batch script — reads inputs.json, writes output.json
│   ├── server.js           # Express API server
│   ├── process-message.js  # LLM call + result assembly
│   ├── routing.js          # ROUTING table + resolveQueue()
│   ├── escalation.js       # Keyword list + applyEscalationRules()
│   ├── schema.js           # Tool schema (CLASSIFY_TOOL)
│   └── prompts.js          # System prompt (SYSTEM_PROMPT)
├── docs/
│   ├── ARCHITECTURE.md     # System design and architecture write-up
│   └── PROMPTS.md          # Prompt documentation and design decisions
├── test/
│   ├── escalation.test.js  # Unit tests for escalation rules
│   └── routing.test.js     # Unit tests for routing logic
├── inputs.json             # Sample inbound messages
├── output.json             # Processed results
├── render.yaml             # Render deployment config
├── eslint.config.js
└── .prettierrc
```

## Input Format

`inputs.json` is an array of message objects:

```json
[
  {
    "id": "msg_001",
    "source": "Email",
    "raw_message": "Your raw support message text here."
  }
]
```

`source` is optional. `id` and `raw_message` are required.

## Output Format

Each record in `output.json` contains:

| Field | Description |
|---|---|
| `id` | Message identifier from input |
| `source` | Inbound channel (Email, Web Form, Support Portal) |
| `raw_message` | Original message text |
| `category` | Bug Report, Feature Request, Billing Issue, Technical Question, or Incident/Outage |
| `confidence` | Float 0.0–1.0 — model certainty about the category |
| `priority` | High, Medium, or Low |
| `core_issue` | One-sentence description of the customer's problem |
| `urgency_signal` | Short phrase summarising urgency |
| `summary` | 2–3 sentence human-readable summary for the receiving team |
| `queue` | Destination queue: Engineering, Product, Billing, IT/Security, or Review |
| `entities` | Extracted company, product, user, error codes, and other identifiers |
| `escalate` | `true` if flagged for human review |
| `escalation_reasons` | List of rules that triggered escalation |

A record is escalated (`escalate: true`) when confidence is below 0.70 or the message matches a high-impact keyword (e.g. `outage`, `stopped loading`, `billing error`). Low-confidence records are also routed to the `Review` queue instead of the standard destination.

## Model

`llama-3.3-70b-versatile` via Groq. Change the `model` parameter in `src/process-message.js` to switch models. Groq exposes an OpenAI-compatible API so any Groq-hosted model works as a drop-in replacement.
