import OpenAI from "openai";
import { assertConfig, config } from "./config.js";

async function main() {
  assertConfig();

  const prompt = process.argv.slice(2).join(" ").trim() || "Say hello from GPT-5.5.";
  const client = new OpenAI({ apiKey: config.apiKey });

  const response = await client.responses.create({
    model: config.model,
    reasoning: {
      effort: config.reasoningEffort,
    },
    input: prompt,
  });

  console.log(response.output_text);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
