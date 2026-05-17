import express from "express";
import { processMessage } from "./process-message.js";

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ status: "ok", service: "arcvault-triage" });
});

/**
 * POST /triage
 * Body: { id, raw_message, source? }
 * Returns: enriched and routed record
 */
app.post("/triage", async (req, res) => {
  const { id, raw_message, source } = req.body;

  if (!id || !raw_message) {
    return res.status(400).json({ error: "id and raw_message are required" });
  }

  const result = await processMessage({ id, raw_message, source });
  res.json(result);
});

/**
 * POST /triage/batch
 * Body: [{ id, raw_message, source? }, ...]
 * Returns: array of enriched and routed records
 */
app.post("/triage/batch", async (req, res) => {
  const messages = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "Body must be a non-empty array of messages" });
  }

  const results = [];
  for (const msg of messages) {
    if (!msg.id || !msg.raw_message) {
      return res.status(400).json({ error: `Message missing id or raw_message`, message: msg });
    }
    const result = await processMessage(msg);
    results.push(result);
  }

  res.json(results);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`ArcVault triage server running on port ${PORT}`);
});
