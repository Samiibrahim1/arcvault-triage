export const CLASSIFY_TOOL = {
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
          description: "Confidence score between 0.0 and 1.0 for the classification.",
        },
        priority: {
          type: "string",
          enum: ["Low", "Medium", "High"],
          description:
            "Urgency priority. High: service down, data loss, compliance risk, or many users affected. Medium: degraded functionality or billing dispute. Low: questions, feature requests, or single-user issues.",
        },
        core_issue: {
          type: "string",
          description: "One sentence describing the specific problem or request the customer is raising.",
        },
        urgency_signal: {
          type: "string",
          description: "A short phrase (5 words or fewer) capturing the urgency level, e.g. 'multiple users blocked', 'single user inconvenience', 'invoice discrepancy'.",
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
              description: "Error codes, HTTP status codes, or error identifiers mentioned.",
            },
            other: {
              type: "object",
              description: "Any other notable extracted entities such as plan names, amounts, or dates.",
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
