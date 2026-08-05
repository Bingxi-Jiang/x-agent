import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

process.env.DATABASE_PATH = `/tmp/x-agent-services-${randomUUID()}.db`;

test("ranking returns a substantive 50/50 technical batch", async () => {
  const [{ fixturePosts }, { rankAndSelectPosts }] = await Promise.all([
    import("@/lib/fixtures"),
    import("@/lib/x-posts"),
  ]);
  const selected = rankAndSelectPosts(fixturePosts, new Set(), 10);

  assert.equal(selected.length, 10);
  assert.equal(selected.filter((post) => post.category === "software_engineering").length, 5);
  assert.equal(selected.filter((post) => post.category === "ai_ml").length, 5);
});

test("For You selection preserves captured feed order", async () => {
  const [{ fixturePosts }, { selectForYouPosts }] = await Promise.all([
    import("@/lib/fixtures"),
    import("@/lib/x-posts"),
  ]);
  const feed = fixturePosts.slice(0, 12).reverse();
  const seen = new Set([feed[2].id]);
  const selected = selectForYouPosts(feed, seen, 10);

  assert.deepEqual(selected.map((post) => post.id), feed.filter((post) => !seen.has(post.id)).slice(0, 10).map((post) => post.id));
  assert.deepEqual(selected.map((post) => post.score), [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
});

test("batch generation calls and stores only enabled providers", async () => {
  const [{ fixturePosts }, { generateBatchWithDependencies }, { saveSettings }] = await Promise.all([
    import("@/lib/fixtures"),
    import("@/lib/batches"),
    import("@/lib/db"),
  ]);
  const calls: string[] = [];
  const dependencies = {
    fetchPosts: async () => ({ posts: fixturePosts, source: "fixtures" as const }),
    generate: async (provider: "openai" | "claude") => {
      calls.push(provider);
      return `${provider} generated reply`;
    },
    assertCredential: () => undefined,
  };

  saveSettings({ useOpenAI: true, useClaude: false, voiceUpdateProvider: "openai" });
  const openAIOnly = await generateBatchWithDependencies(dependencies);
  assert.equal(calls.length, 10);
  assert.equal(calls.join(","), Array(10).fill("openai").join(","));
  assert.ok(openAIOnly.posts.every((post) => post.drafts.openai && !post.drafts.claude));

  calls.length = 0;
  saveSettings({ useOpenAI: false, useClaude: true, voiceUpdateProvider: "claude" });
  const claudeOnly = await generateBatchWithDependencies(dependencies);
  assert.equal(calls.length, 10);
  assert.deepEqual([...new Set(calls)], ["claude"]);
  assert.ok(claudeOnly.posts.every((post) => post.drafts.claude && !post.drafts.openai));

  calls.length = 0;
  saveSettings({ useOpenAI: true, useClaude: true, voiceUpdateProvider: "openai" });
  const both = await generateBatchWithDependencies(dependencies);
  assert.equal(calls.filter((provider) => provider === "openai").length, 10);
  assert.equal(calls.filter((provider) => provider === "claude").length, 10);
  assert.ok(both.posts.every((post) => post.drafts.openai && post.drafts.claude));
});
