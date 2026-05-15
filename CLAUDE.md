# ArcVault Triage Pipeline

## Project Overview

Agentic workflow that ingests unstructured B2B support messages, classifies and enriches them, routes them to the correct queue, and outputs structured JSON.

## Pipeline Stages

1. **Ingest** — Accept raw support messages (unstructured text)
2. **Classify** — Assign one of five categories with a confidence score
3. **Enrich** — Extract named entities (company, product, user, error codes, etc.)
4. **Route** — Map category to destination queue
5. **Output** — Write a single JSON file containing all 5 processed records

## Classification Categories

| Label | Queue |
|---|---|
| Bug Report | Engineering |
| Feature Request | Product |
| Billing Issue | Billing |
| Technical Question | Engineering |
| Incident/Outage | IT/Security |

## Escalation Rules

Flag a record for human review (`"escalate": true`) when **any** of the following apply:

- Classifier confidence is below **70%**
- Message text contains any of these keywords (case-insensitive):
  - `outage`
  - `down for all users`
  - `billing error`

## Output Schema

All 5 processed records must be written to a single JSON file. Each record follows this structure:

```json
{
  "id": "string",
  "raw_message": "string",
  "category": "Bug Report | Feature Request | Billing Issue | Technical Question | Incident/Outage",
  "confidence": 0.0,
  "queue": "Engineering | Billing | Product | IT/Security",
  "entities": {
    "company": "string | null",
    "product": "string | null",
    "user": "string | null",
    "error_codes": ["string"],
    "other": {}
  },
  "escalate": false,
  "escalation_reasons": []
}
```

## Key Constraints

- Output is one file containing all records (not one file per record)
- Escalation reasons should enumerate which rule(s) triggered (e.g. `"low_confidence"`, `"keyword:outage"`)
- Confidence is a float between 0.0 and 1.0
- All five category/queue combinations in the routing table must be exercised across the 5 records
