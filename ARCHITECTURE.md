# ArcVault Triage Pipeline — Architecture

## System Design

The pipeline is a five-stage linear workflow: ingest → classify → enrich → route → output. All five stages execute within a single Node.js process, and the LLM handles classify and enrich in one shot via forced tool use.

```
inputs.json
    │
    ▼
┌─────────────┐
│   Ingest    │  Read raw messages from disk
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────┐
│         Classify + Enrich (LLM)         │
│  model: llama-3.3-70b-versatile @ Groq  │
│  tool_choice: classify_and_enrich       │
│  → category, confidence, entities       │
└──────┬──────────────────────────────────┘
       │
       ▼
┌─────────────┐
│    Route    │  ROUTING table: category → queue
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Escalate  │  Rule engine: confidence + keywords
└──────┬──────┘
       │
       ▼
output.json
```

Classify and enrich are collapsed into a single LLM call rather than two separate calls. This halves API latency and cost per message and avoids a failure mode where classification succeeds but enrichment fails, leaving a record in a half-processed state. The tradeoff is a slightly more complex tool schema, which is worth it given the gains.

Messages are processed sequentially rather than in parallel. For five messages this is the right call — parallel requests would offer no meaningful speedup and risk hitting rate limits on the free Groq tier. Sequential processing also makes log output readable in order.

---

## Routing Logic

Routing is a pure lookup table defined in `ROUTING` at the top of `pipeline.js`:

| Category | Queue |
|---|---|
| Bug Report | Engineering |
| Feature Request | Product |
| Billing Issue | Billing |
| Technical Question | Engineering |
| Incident/Outage | IT/Security |

The mapping is intentional: routing lives in application code, not inside the LLM prompt. This means routing rules are versioned in git, testable without an API call, and changeable without touching the prompt. If the model returns a category not in the table, `ROUTING[category]` returns `undefined`, which surfaces immediately as a visible gap in the output rather than silently routing to a wrong queue.

---

## Escalation Logic

Escalation is a two-rule OR gate applied after every classification:

```
escalate = (confidence < 0.70) OR (message matches any keyword pattern)
```

**Rule 1 — Low confidence.** If the model's self-reported confidence is below 0.70, the record is flagged for human review. This catches genuinely ambiguous messages where the model is uncertain, regardless of which category it chose.

**Rule 2 — Keyword match.** Three regex patterns are checked against the raw message text (case-insensitive):
- `/outage/i` → `keyword:outage`
- `/down for all users/i` → `keyword:down_for_all_users`
- `/billing error/i` → `keyword:billing_error`

These patterns target language that signals high business impact independently of how the model classified the message. A billing dispute that never trips the low-confidence rule but contains the phrase "billing error" should still be reviewed by a human.

Escalation reasons are additive — multiple rules can fire on the same record, and all triggered reasons are recorded in `escalation_reasons`. This gives the human reviewer context on why the record was flagged, not just that it was.

Like routing, escalation logic lives in application code and not in the prompt. The LLM is not asked to decide whether to escalate; it only provides the confidence score and the raw text that the rule engine operates on. This keeps escalation behavior deterministic and auditable.

---

## What Would Change at Production Scale

**Async queue instead of sequential loop.** At volume, messages would be published to a queue (SQS, Pub/Sub, Kafka) and consumed by worker processes. This decouples ingestion from processing, allows horizontal scaling of workers, and provides retry semantics with dead-letter queues for failed records.

**Persistent storage.** `output.json` works for a batch of five records. At scale, results go into a database (Postgres for structured queries, or a document store if the `entities.other` schema stays open-ended). Queues like Engineering or Billing need a live view of their backlog, not a file on disk.

**Structured logging and observability.** `console.log` is replaced with a structured logger (e.g., `pino`) emitting JSON to stdout. Every record gets a trace ID so classification decisions, latency, and escalation rates are queryable. Dashboards track per-category volume and confidence distribution over time — drift in either signals prompt degradation or a shift in incoming message patterns.

**Prompt versioning and shadow evaluation.** Prompt changes go through an eval harness before deployment: a held-out labeled set of support messages is run against both the old and new prompt, and the diff in category assignments and escalation rates is reviewed before rollout. Without this, a prompt change that improves one category can silently regress another.

**Secrets management.** `GROQ_API_KEY` moves from an env var passed at the CLI to a secrets manager (AWS Secrets Manager, GCP Secret Manager, Vault). Rotation is automated, and the key is never in shell history or process listings.

**Retry and fallback.** The API call in `processMessage` gets exponential backoff with jitter for transient errors, and a circuit breaker that stops hammering the API if the error rate crosses a threshold. A fallback model (smaller, cheaper) can be used for non-urgent messages when the primary model is degraded.

---

## Phase 2 Additions

**Confidence calibration against ground truth.** The model's self-reported confidence scores are not calibrated — a score of 0.90 does not reliably mean the classification is correct 90% of the time. Phase 2 would collect human-labeled outcomes for escalated records and run a calibration pass (Platt scaling or isotonic regression) to map raw scores to true probabilities. The `confidence < 0.70` threshold would then be tuned against recall targets rather than set arbitrarily.

**Multi-turn enrichment for ambiguous records.** When confidence is low, a second LLM call asks a targeted clarifying question — "is this a billing dispute or a technical access issue?" — using the first response as context. The human reviewer sees the model's self-interrogation alongside the final classification, which reduces escalation noise over time.

**Feedback loop from resolved tickets.** Once a ticket is resolved and categorized by the receiving team, that outcome is written back as a labeled training example. Over time this builds a dataset for fine-tuning or few-shot example selection, which would improve accuracy on ArcVault-specific jargon and edge cases that a general-purpose model handles poorly.

**SLA-aware prioritization.** Routing currently maps category to queue but ignores urgency within a queue. Phase 2 would score each record on a priority index derived from entity signals — affected user count, enterprise plan flag, financial services industry tag, presence of a compliance risk marker — and use that score to order records within a queue rather than treating all Incident/Outage tickets as equal.

**Webhook delivery.** Instead of writing a file, processed records are POSTed to the destination queue's webhook endpoint (Jira, Linear, Zendesk, PagerDuty for IT/Security). The output schema maps directly to the target system's ticket fields, eliminating the manual step of a human reading `output.json` and creating tickets by hand.
