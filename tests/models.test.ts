import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { callModel } from "@/lib/models";

const originalFetch = globalThis.fetch;
const originalKey = process.env.OPENAI_API_KEY;
const originalModel = process.env.OPENAI_MODEL;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalKey;
  if (originalModel === undefined) delete process.env.OPENAI_MODEL;
  else process.env.OPENAI_MODEL = originalModel;
});

test("OpenAI reasoning requests reserve space beyond the visible text limit", async () => {
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_MODEL = "gpt-5-mini";
  let requestBody: Record<string, unknown> | undefined;
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        status: "completed",
        output: [{ type: "message", content: [{ type: "output_text", text: "A concise reply." }] }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  const text = await callModel("openai", "system", "user", 350);

  assert.equal(text, "A concise reply.");
  assert.equal(requestBody?.max_output_tokens, 4_096);
  assert.deepEqual(requestBody?.reasoning, { effort: "low" });
});

test("OpenAI retries once when reasoning consumes the first output budget", async () => {
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_MODEL = "gpt-5-mini";
  const budgets: number[] = [];
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { max_output_tokens: number };
    budgets.push(body.max_output_tokens);
    if (budgets.length === 1) {
      return new Response(
        JSON.stringify({
          status: "incomplete",
          incomplete_details: { reason: "max_output_tokens" },
          output: [{ type: "reasoning" }],
          usage: { output_tokens: 4_096, output_tokens_details: { reasoning_tokens: 4_096 } },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ status: "completed", output_text: "Retry succeeded." }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const text = await callModel("openai", "system", "user", 350);

  assert.equal(text, "Retry succeeded.");
  assert.deepEqual(budgets, [4_096, 25_000]);
});

test("OpenAI reports token exhaustion after the retry", async () => {
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_MODEL = "gpt-5-mini";
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { max_output_tokens: number };
    return new Response(
      JSON.stringify({
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
        output: [{ type: "reasoning" }],
        usage: {
          output_tokens: body.max_output_tokens,
          output_tokens_details: { reasoning_tokens: body.max_output_tokens },
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  await assert.rejects(
    callModel("openai", "system", "user", 350),
    /exhausted the 25000-token output budget.*reasoning tokens used: 25000/i,
  );
});
