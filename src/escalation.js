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

/**
 * Apply escalation rules to a message.
 * A record is escalated when confidence is below 0.70 or the raw message
 * matches any high-impact keyword pattern. All triggered reasons are returned.
 * @param {string} rawMessage - Original message text.
 * @param {number} confidence - Confidence score between 0.0 and 1.0.
 * @returns {{ escalate: boolean, escalation_reasons: string[] }}
 */
export function applyEscalationRules(rawMessage, confidence) {
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
