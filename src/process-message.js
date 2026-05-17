import OpenAI from "openai";
import { CLASSIFY_TOOL } from "./schema.js";
import { SYSTEM_PROMPT } from "./prompts.js";
import { resolveQueue } from "./routing.js";
import { applyEscalationRules } from "./escalation.js";

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

/**
 * Process a single support message through the classify → enrich → route → escalate pipeline.
 * @param {{ id: string, source?: string, raw_message: string }} msg - Raw inbound message.
 * @returns {Promise<object>} Fully enriched and routed record ready for output.
 */
export async function processMessage(msg) {
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
      Object.entries(parsed.entities.other).filter(([, v]) => v !== ""),
    ),
  };

  const queue = resolveQueue(category, confidence);
  const { escalate, escalation_reasons } = applyEscalationRules(msg.raw_message, confidence);

  const escalationNote = escalate ? `  ⚠ ${escalation_reasons.join(", ")}` : "";
  console.log(`✓ ${msg.id} → ${category} (${confidence.toFixed(2)}) [${queue}] [${priority}]${escalationNote}`);

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
