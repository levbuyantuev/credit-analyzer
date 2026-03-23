import OpenAI from "openai";

const apiKey =
  process.env.OPENROUTER_API_KEY ||
  process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY;

const baseURL =
  process.env.OPENROUTER_API_KEY
    ? "https://openrouter.ai/api/v1"
    : process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL;

if (!apiKey) {
  throw new Error(
    "OPENROUTER_API_KEY must be set. Get a free key at https://openrouter.ai/keys",
  );
}

export const openrouter = new OpenAI({
  baseURL,
  apiKey,
  defaultHeaders: {
    "HTTP-Referer": "https://credit-analyzer.replit.app",
    "X-Title": "Credit Analyzer",
  },
});
