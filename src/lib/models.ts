import { assertProviderCredential, modelName } from "@/lib/config";
import type { Provider } from "@/lib/types";

interface OpenAIResponse {
  output_text?: string;
  status?: string;
  incomplete_details?: { reason?: string };
  output?: {
    type?: string;
    content?: { type?: string; text?: string; refusal?: string }[];
  }[];
  usage?: {
    output_tokens?: number;
    output_tokens_details?: { reasoning_tokens?: number };
  };
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

function isOpenAIReasoningModel(model: string): boolean {
  return /^(?:gpt-5(?:[.-]|$)|o[134](?:[.-]|$))/i.test(model);
}

function openAIOutputBudget(maxTokens: number): number {
  // max_output_tokens includes hidden reasoning tokens, not just visible text.
  return Math.max(4_096, maxTokens * 4);
}

function openAIEmptyOutputError(payload: OpenAIResponse, outputBudget: number): Error {
  const refusal = (payload.output ?? [])
    .flatMap((item) => item.content ?? [])
    .find((item) => item.type === "refusal" && item.refusal)?.refusal;
  if (refusal) return new Error(`OpenAI refused the request: ${refusal}`);

  const reason = payload.incomplete_details?.reason;
  if (payload.status === "incomplete" && reason === "max_output_tokens") {
    const reasoningTokens = payload.usage?.output_tokens_details?.reasoning_tokens;
    const usage = reasoningTokens === undefined ? "" : `; reasoning tokens used: ${reasoningTokens}`;
    return new Error(
      `OpenAI exhausted the ${outputBudget}-token output budget before producing text${usage}.`,
    );
  }

  const outputTypes = (payload.output ?? []).map((item) => item.type).filter(Boolean).join(", ") || "none";
  return new Error(
    `OpenAI returned no text output (status: ${payload.status ?? "unknown"}; output types: ${outputTypes}).`,
  );
}

async function requestOpenAI(
  system: string,
  user: string,
  model: string,
  outputBudget: number,
): Promise<OpenAIResponse> {
  const body: Record<string, unknown> = {
    model,
    input: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_output_tokens: outputBudget,
  };
  if (isOpenAIReasoningModel(model)) {
    body.reasoning = { effort: "low" };
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY!.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const payload = (await response.json()) as OpenAIResponse;
  if (!response.ok) {
    throw new Error(`OpenAI request failed (${response.status}): ${payload.error?.message ?? "Unknown API error"}`);
  }
  return payload;
}

async function callOpenAI(system: string, user: string, maxTokens: number): Promise<string> {
  const model = modelName("openai");
  let outputBudget = openAIOutputBudget(maxTokens);
  let payload = await requestOpenAI(system, user, model, outputBudget);
  let text = openAIText(payload);

  if (!text && payload.status === "incomplete" && payload.incomplete_details?.reason === "max_output_tokens") {
    outputBudget = Math.max(25_000, outputBudget * 2);
    payload = await requestOpenAI(system, user, model, outputBudget);
    text = openAIText(payload);
  }

  if (!text) throw openAIEmptyOutputError(payload, outputBudget);
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
