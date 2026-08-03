import { assertProviderCredential, modelName } from "@/lib/config";
import type { Provider } from "@/lib/types";

interface OpenAIResponse {
  output_text?: string;
  output?: { content?: { type?: string; text?: string }[] }[];
  error?: { message?: string };
}

interface AnthropicResponse {
  content?: { type?: string; text?: string }[];
  error?: { message?: string };
}

function openAIText(payload: OpenAIResponse): string {
  if (payload.output_text?.trim()) return payload.output_text.trim();
  return (payload.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && item.text)
    .map((item) => item.text)
    .join("\n")
    .trim();
}

async function callOpenAI(system: string, user: string, maxTokens: number): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY!.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelName("openai"),
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_output_tokens: maxTokens,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const payload = (await response.json()) as OpenAIResponse;
  if (!response.ok) {
    throw new Error(`OpenAI request failed (${response.status}): ${payload.error?.message ?? "Unknown API error"}`);
  }
  const text = openAIText(payload);
  if (!text) throw new Error("OpenAI returned no text output.");
  return text;
}

async function callClaude(system: string, user: string, maxTokens: number): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY!.trim(),
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelName("claude"),
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const payload = (await response.json()) as AnthropicResponse;
  if (!response.ok) {
    throw new Error(`Claude request failed (${response.status}): ${payload.error?.message ?? "Unknown API error"}`);
  }
  const text = (payload.content ?? [])
    .filter((item) => item.type === "text" && item.text)
    .map((item) => item.text)
    .join("\n")
    .trim();
  if (!text) throw new Error("Claude returned no text output.");
  return text;
}

export async function callModel(
  provider: Provider,
  system: string,
  user: string,
  maxTokens = 350,
): Promise<string> {
  assertProviderCredential(provider);
  return provider === "openai" ? callOpenAI(system, user, maxTokens) : callClaude(system, user, maxTokens);
}

export function parseModelJson<T>(text: string): T {
  const unfenced = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("The model did not return a JSON object.");
  return JSON.parse(unfenced.slice(start, end + 1)) as T;
}
