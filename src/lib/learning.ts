import { readFile } from "node:fs/promises";
import path from "node:path";

import { recentReviewedRows } from "@/lib/db";
import type { CandidatePost, FeedbackCategory, RelevantExample } from "@/lib/types";

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "because",
  "been",
  "before",
  "being",
  "between",
  "could",
  "does",
  "from",
  "have",
  "into",
  "more",
  "most",
  "only",
  "other",
  "should",
  "than",
  "that",
  "their",
  "there",
  "these",
  "they",
  "this",
  "through",
  "very",
  "what",
  "when",
  "where",
  "which",
  "with",
  "would",
]);

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 3 && !STOP_WORDS.has(token)),
  );
}

function overlapScore(source: string, target: Set<string>): number {
  let overlap = 0;
  for (const token of tokens(source)) {
    if (target.has(token)) overlap += 1;
  }
  return overlap;
}

export function retrieveRelevantExamples(postText: string, limit = 4): RelevantExample[] {
  const targetTokens = tokens(postText);
  return recentReviewedRows(80)
    .map((row) => {
      const replacement = String(row.replacement_reply ?? "").trim();
      const edited = String(row.edited_reply ?? "").trim();
      const selected = String(row.selected_reply ?? "").trim();
      const acceptedReply = replacement || edited || selected;
      const writtenFeedback = String(row.written_feedback ?? "");
      const category = String(row.feedback_category) as FeedbackCategory;
      const score =
        overlapScore(String(row.source_post), targetTokens) * 3 +
        overlapScore(acceptedReply, targetTokens) +
        (category === "sounds_like_me" ? 2 : 0) +
        (replacement ? 2 : 0);
      return {
        sourcePost: String(row.source_post),
        acceptedReply,
        feedbackCategory: category,
        writtenFeedback,
        score,
      };
    })
    .filter((example) => example.acceptedReply && example.feedbackCategory !== "would_not_reply")
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function summarizeFeedbackPatterns(): string {
  const rows = recentReviewedRows(50);
  if (rows.length === 0) return "No reviewed feedback patterns yet.";

  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = String(row.feedback_category);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const categorySummary = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([category, count]) => `${category.replaceAll("_", " ")}: ${count}`)
    .join(", ");
  const explicitFeedback = rows
    .map((row) => String(row.written_feedback ?? "").trim())
    .filter(Boolean)
    .slice(0, 5);
  return [
    `Recent feedback category counts (${rows.length} reviewed items maximum): ${categorySummary}.`,
    explicitFeedback.length
      ? `Most recent explicit notes:\n${explicitFeedback.map((note) => `- ${note}`).join("\n")}`
      : "No recent written feedback notes.",
  ].join("\n");
}

export async function readPersistentProfiles(): Promise<{ paulProfile: string; voiceProfile: string }> {
  const [paulProfile, voiceProfile] = await Promise.all([
    readFile(path.join(process.cwd(), "data", "paul-profile.md"), "utf8"),
    readFile(path.join(process.cwd(), "data", "pj-voice.md"), "utf8"),
  ]);
  return { paulProfile, voiceProfile };
}

export async function buildReplyPrompt(post: CandidatePost): Promise<{ system: string; user: string }> {
  const { paulProfile, voiceProfile } = await readPersistentProfiles();
  const examples = retrieveRelevantExamples(post.text, 4);
  const patterns = summarizeFeedbackPatterns();
  const exampleText = examples.length
    ? examples
        .map(
          (example, index) =>
            `Example ${index + 1}\nSource: ${example.sourcePost}\nPreferred reply: ${example.acceptedReply}\nFeedback: ${example.writtenFeedback || example.feedbackCategory.replaceAll("_", " ")}`,
        )
        .join("\n\n")
    : "No relevant reviewed examples yet.";

  return {
    system: `You write one possible public X reply in Paul Jiang's voice. This is context-based generation, not fine-tuning.\n\n${paulProfile}\n\n${voiceProfile}\n\nHard requirements:\n- Output only the reply, with no label or quotation marks.\n- Use natural English only and remain concise enough for an X reply.\n- Add a concrete idea, distinction, implication, or opinion.\n- Never fabricate Paul's firsthand experience.\n- Do not use corporate hype, empty agreement, or a generic closing question.`,
    user: `Original X post by ${post.authorName} (@${post.username}):\n${post.text}\n\nEngagement context: ${post.metrics.likes} likes, ${post.metrics.reposts} reposts, ${post.metrics.replies} replies, ${post.metrics.quotes} quotes.\nTopic: ${post.category === "ai_ml" ? "AI / ML" : "software engineering"}.\n\nRelevant reviewed examples (small retrieved set only):\n${exampleText}\n\nRelevant feedback patterns:\n${patterns}\n\nWrite one reply.`,
  };
}
