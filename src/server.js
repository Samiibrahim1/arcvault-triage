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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`ArcVault triage server running on port ${PORT}`);
});
