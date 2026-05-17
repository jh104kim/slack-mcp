import "dotenv/config";

export const config = {
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_MODEL || "gpt-5.5",
  reasoningEffort: process.env.OPENAI_REASONING_EFFORT || "medium",
};

export function assertConfig() {
  if (!config.apiKey) {
    throw new Error(
      "OPENAI_API_KEY is missing. Copy .env.example to .env and set your API key."
    );
  }
}
