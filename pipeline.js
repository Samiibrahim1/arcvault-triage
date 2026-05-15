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
];

const CLASSIFY_TOOL = {
  type: "function",
  function: {
    name: "classify_and_enrich",
    description:
      "Classify a B2B customer support message into a category and extract named entities from it.",
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
        entities: {
          type: "object",
          properties: {
            company: {
              type: ["string", "null"],
              description: "Customer company or organization name, or null.",
            },
            product: {
              type: ["string", "null"],
              description: "Product or service name referenced, or null.",
            },
            user: {
              type: ["string", "null"],
              description: "Name of the person who sent the message, or null.",
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
            },
          },
          required: ["company", "product", "user", "error_codes", "other"],
        },
      },
      required: ["category", "confidence", "entities"],
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

Entities to extract:
- company: customer's company or organization name (null if not mentioned)
- product: specific product or service referenced (null if not mentioned)
- user: name of the person who sent the message (null if not mentioned)
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

  const { category, confidence, entities } = JSON.parse(toolCall.function.arguments);
  const queue = ROUTING[category];
  const { escalate, escalation_reasons } = applyEscalationRules(
    msg.raw_message,
    confidence,
  );

  const escalationNote = escalate
    ? `  ⚠ ${escalation_reasons.join(", ")}`
    : "";
  console.log(
    `✓ ${msg.id} → ${category} (${confidence.toFixed(2)}) [${queue}]${escalationNote}`,
  );

  return {
    id: msg.id,
    raw_message: msg.raw_message,
    category,
    confidence,
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
