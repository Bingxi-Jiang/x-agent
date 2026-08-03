import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

process.env.DATABASE_PATH = `/tmp/x-agent-db-${randomUUID()}.db`;

test("provider settings persist and reject disabling both providers", async () => {
  const { getSettings, saveSettings } = await import("@/lib/db");

  assert.deepEqual(
    { openai: getSettings().useOpenAI, claude: getSettings().useClaude },
    { openai: true, claude: true },
  );

  saveSettings({ useOpenAI: true, useClaude: false, voiceUpdateProvider: "openai" });
  assert.equal(getSettings().useClaude, false);
  assert.throws(
    () => saveSettings({ useOpenAI: false, useClaude: false, voiceUpdateProvider: "openai" }),
    /At least one reply provider/,
  );
});

test("historical drafts and feedback survive later provider changes", async () => {
  const [{ comparisonStats }, db] = await Promise.all([import("@/lib/stats"), import("@/lib/db")]);
  const post = {
    id: "history-post",
    authorName: "Systems Notes",
    username: "systems_notes",
    text: "Database cache invalidation requires an explicit consistency boundary for every reader of the system.",
    createdAt: new Date().toISOString(),
    metrics: { likes: 100, reposts: 20, replies: 5, quotes: 2 },
    url: "https://x.com/systems_notes/status/history-post",
    media: [],
    category: "software_engineering" as const,
    score: 10,
  };
  const batchId = db.createBatch([post], ["openai", "claude"], "fixtures", "voice-test");
  db.saveDraft(post.id, "openai", "OpenAI historical draft");
  db.saveDraft(post.id, "claude", "Claude historical draft");
  db.markBatchReady(batchId);
  db.saveReview({
    postId: post.id,
    selectedSource: "claude",
    selectedReply: "Claude historical draft",
    editedReply: "Claude historical draft, edited.",
    replacementReply: "",
    feedbackCategory: "sounds_like_me",
    writtenFeedback: "Keep the concrete consistency distinction.",
    wouldReply: true,
  });

  db.saveSettings({ useOpenAI: true, useClaude: false, voiceUpdateProvider: "openai" });
  const historicalBatch = db.getBatch(batchId)!;
  assert.equal(historicalBatch.posts[0].drafts.claude?.content, "Claude historical draft");
  assert.equal(historicalBatch.posts[0].review?.selectedSource, "claude");
  assert.equal(comparisonStats(historicalBatch).claude?.selected, 1);
});
