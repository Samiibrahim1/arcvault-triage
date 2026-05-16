import OpenAI from "openai";
import { readFileSync, writeFileSync } from "fs";

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

const ROUTING = {
  "Bug Report": "Engineering",
  "Feature Request": "Product",
  "Billing Issue": "Billing",
  "Technical Question": "Engineering",
  "Incident/Outage": "IT/Security",
};

const ESCALATION_KEYWORDS = [
  { pattern: /outage/i, reason: "keyword:outage" },
  { pattern: /down for all users/i, reason: "keyword:down_for_all_users" },
  { pattern: /billing error/i, reason: "keyword:billing_error" },
  { pattern: /stopped loading/i, reason: "keyword:stopped_loading" },
  { pattern: /multiple users affected/i, reason: "keyword:multiple_users_affected" },
  { pattern: /not loading/i, reason: "keyword:not_loading" },
  { pattern: /can'?t access/i, reason: "keyword:cant_access" },
  { pattern: /cannot access/i, reason: "keyword:cannot_access" },
  { pattern: /completely down/i, reason: "keyword:completely_down" },
];

const CLASSIFY_TOOL = {
  type: "function",
  function: {
    name: "classify_and_enrich",
    description:
      "Classify a B2B customer support message into a category, extract named entities, and produce a human-readable summary for the receiving team.",
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: [
            "Bug Report",
            "Feature Request",
            "Billing Issue",
            "Technical Question",
            "Incident/Outage",
          ],
          description: "The classification category of the support message.",
        },
        confidence: {
          type: "number",
          description:
            "Confidence score between 0.0 and 1.0 for the classification.",
        },
        priority: {
          type: "string",
          enum: ["Low", "Medium", "High"],
          description:
            "Urgency priority. High: service down, data loss, compliance risk, or many users affected. Medium: degraded functionality or billing dispute. Low: questions, feature requests, or single-user issues.",
        },
        core_issue: {
          type: "string",
          description:
            "One sentence describing the specific problem or request the customer is raising.",
        },
        urgency_signal: {
          type: "string",
          description:
            "A short phrase (5 words or fewer) capturing the urgency level, e.g. 'multiple users blocked', 'single user inconvenience', 'invoice discrepancy'.",
        },
        summary: {
          type: "string",
          description:
            "2-3 sentence human-readable summary for the team receiving this ticket. Include who is affected, what the problem is, and any key details they need to act.",
        },
        entities: {
          type: "object",
          properties: {
            company: {
              type: "string",
              description: "Customer company or organization name, or empty string if not mentioned.",
            },
            product: {
              type: "string",
              description: "Product or service name referenced, or empty string if not mentioned.",
            },
            user: {
              type: "string",
              description: "Name of the person who sent the message, or empty string if not mentioned.",
            },
            error_codes: {
              type: "array",
              items: { type: "string" },
              description:
                "Error codes, HTTP status codes, or error identifiers mentioned.",
            },
            other: {
              type: "object",
              description:
                "Any other notable extracted entities such as plan names, amounts, or dates.",
              additionalProperties: true,
            },
          },
          required: ["company", "product", "user", "error_codes", "other"],
        },
      },
      required: ["category", "confidence", "priority", "core_issue", "urgency_signal", "summary", "entities"],
    },
  },
};

const SYSTEM_PROMPT = `You are an expert B2B customer support triage agent. Your job is to analyze each support message and call the classify_and_enrich tool with your analysis.

Classification categories — choose exactly one:
- Bug Report: A defect, error, or unexpected behavior in the product
- Feature Request: A request for new functionality or an enhancement
- Billing Issue: A question or dispute about invoices, charges, or payments
- Technical Question: A question about how to use the product, API, or integrations
- Incident/Outage: A report of a service outage, downtime, or severe degradation affecting users

Confidence score: a float between 0.0 and 1.0 reflecting how certain you are about the category.

Priority:
- High: service is down, data loss risk, compliance impact, or many users blocked
- Medium: degraded functionality, billing dispute, or moderate business impact
- Low: how-to questions, feature requests, or single-user inconveniences

Entities to extract:
- company: customer's company or organization name (empty string if not mentioned)
- product: specific product or service referenced (empty string if not mentioned)
- user: name of the person who sent the message (empty string if not mentioned)
- error_codes: array of any error codes, HTTP status codes, or error identifiers (empty array if none)
- other: object with any other notable entities such as plan names, dollar amounts, timestamps, or affected user counts`;

function applyEscalationRules(rawMessage, confidence) {
  const reasons = [];

  if (confidence < 0.7) {
    reasons.push("low_confidence");
  }

  for (const { pattern, reason } of ESCALATION_KEYWORDS) {
    if (pattern.test(rawMessage)) {
      reasons.push(reason);
    }
  }

  return { escalate: reasons.length > 0, escalation_reasons: reasons };
}

async function processMessage(msg) {
  const response = await client.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: 1024,
    tools: [CLASSIFY_TOOL],
    tool_choice: { type: "function", function: { name: "classify_and_enrich" } },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: msg.raw_message },
    ],
  });

  const toolCall = response.choices[0]?.message?.tool_calls?.[0];
  if (!toolCall) {
    throw new Error(`No tool_call in response for ${msg.id}`);
  }

  const parsed = JSON.parse(toolCall.function.arguments);
  const { category, confidence, priority, core_issue, urgency_signal, summary } = parsed;
  const entities = {
    ...parsed.entities,
    company: parsed.entities.company || null,
    product: parsed.entities.product || null,
    user: parsed.entities.user || null,
    other: Object.fromEntries(
      Object.entries(parsed.entities.other).filter(([, v]) => v !== "")
    ),
  };

  const queue = confidence < 0.7 ? "Review" : ROUTING[category];
  const { escalate, escalation_reasons } = applyEscalationRules(
    msg.raw_message,
    confidence,
  );

  const escalationNote = escalate ? `  ⚠ ${escalation_reasons.join(", ")}` : "";
  console.log(
    `✓ ${msg.id} → ${category} (${confidence.toFixed(2)}) [${queue}] [${priority}]${escalationNote}`,
  );

  return {
    id: msg.id,
    source: msg.source ?? null,
    raw_message: msg.raw_message,
    category,
    confidence,
    priority,
    core_issue,
    urgency_signal,
    summary,
    queue,
    entities,
    escalate,
    escalation_reasons,
  };
}

async function main() {
  const inputs = JSON.parse(readFileSync("inputs.json", "utf-8"));

  console.log(`Processing ${inputs.length} messages...\n`);

  const results = [];
  for (const msg of inputs) {
    const result = await processMessage(msg);
    results.push(result);
  }

  writeFileSync("output.json", JSON.stringify(results, null, 2));
  console.log(`\nWrote ${results.length} records to output.json`);
}

main().catch((err) => {
  console.error("Pipeline failed:", err.message);
  process.exit(1);
});
