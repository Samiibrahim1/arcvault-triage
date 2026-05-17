import { readFileSync, writeFileSync } from "fs";
import { processMessage } from "./process-message.js";

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
