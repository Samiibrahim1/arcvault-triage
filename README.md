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

## Running the Pipeline

```bash
npm start
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
npm test        # Run unit tests (escalation + routing logic)
npm run lint    # Lint src/ with ESLint
npm run format  # Format all files with Prettier
```

## Project Structure

```
arcvault-triage/
├── src/
│   ├── index.js            # Main loop — reads inputs, writes output
│   ├── process-message.js  # LLM call + result assembly
│   ├── routing.js          # ROUTING table + resolveQueue()
│   ├── escalation.js       # Keyword list + applyEscalationRules()
│   ├── schema.js           # Tool schema (CLASSIFY_TOOL)
│   └── prompts.js          # System prompt (SYSTEM_PROMPT)
├── test/
│   ├── escalation.test.js  # Unit tests for escalation rules
│   └── routing.test.js     # Unit tests for routing logic
├── inputs.json             # Sample inbound messages
├── output.json             # Processed results
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
