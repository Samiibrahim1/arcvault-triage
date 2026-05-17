const ROUTING = {
  "Bug Report": "Engineering",
  "Feature Request": "Product",
  "Billing Issue": "Billing",
  "Technical Question": "Engineering",
  "Incident/Outage": "IT/Security",
};

/**
 * Resolve the destination queue for a classified message.
 * Low-confidence records bypass category routing and go to Review.
 * @param {string} category - Classified category from the LLM.
 * @param {number} confidence - Confidence score between 0.0 and 1.0.
 * @returns {string} Destination queue name.
 */
export function resolveQueue(category, confidence) {
  if (confidence < 0.7) return "Review";
  return ROUTING[category] ?? "Review";
}
