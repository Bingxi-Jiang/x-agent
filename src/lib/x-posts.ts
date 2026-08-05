import { fixturePosts } from "@/lib/fixtures";
import { getLatestForYouPosts } from "@/lib/db";
import type { CandidatePost, TopicCategory } from "@/lib/types";

const AI_TERMS = [
  " ai ",
  "llm",
  "model",
  "agent",
  "inference",
  "training",
  "rag",
  "embedding",
  "multimodal",
  "machine learning",
  "neural",
  "computer vision",
  "coding agent",
  "eval",
  "fine-tuning",
  "observability",
  "quantization",
  "retrieval",
  "structured output",
  "vision",
];

const SWE_TERMS = [
  "database",
  "backend",
  "api",
  "distributed",
  "cloud",
  "devops",
  "compiler",
  "programming",
  "open source",
  "latency",
  "cache",
  "queue",
  "security",
  "architecture",
  "developer",
  "software",
  "authentication",
  "cluster",
  "delivery",
  "feature flag",
  "idempotency",
  "index",
  "language",
  "microservice",
  "network",
  "platform",
  "retry",
  "storage",
  "worker",
  "caching",
  "open-source",
  "p99",
];

const DEPRIORITIZED_TERMS = ["playwright", "selenium", "test automation", "testing framework", "qa engineer"];
const EXCLUDED_TERMS = ["sponsored", "limited offer", "giveaway", "follow me", "culture war", "election", "politics"];

function termCount(text: string, terms: string[]): number {
  const normalized = ` ${text.toLowerCase()} `;
  return terms.reduce((total, term) => total + (normalized.includes(term) ? 1 : 0), 0);
}

export function categorizePost(text: string): TopicCategory {
  return termCount(text, AI_TERMS) > termCount(text, SWE_TERMS) ? "ai_ml" : "software_engineering";
}

export function scorePost(post: CandidatePost, at = Date.now()): number {
  const ageHours = Math.max(0, (at - new Date(post.createdAt).getTime()) / 3_600_000);
  const metrics = post.metrics;
  const engagement =
    Math.log10(metrics.likes + 1) * 3.4 +
    Math.log10(metrics.reposts + 1) * 2.7 +
    Math.log10(metrics.replies + 1) * 2.3 +
    Math.log10(metrics.quotes + 1) * 1.8 +
    Math.log10((metrics.impressions ?? 0) + 1) * 0.6;
  const relevance = Math.min(5, termCount(post.text, [...AI_TERMS, ...SWE_TERMS])) * 1.7;
  const recency = Math.max(-3, 8 - ageHours / 24);
  const substance = Math.min(4, post.text.length / 70);
  const qaPenalty = termCount(post.text, DEPRIORITIZED_TERMS) * 16;
  return engagement + relevance + recency + substance - qaPenalty;
}

function isUseful(post: CandidatePost): boolean {
  const normalized = post.text.toLowerCase();
  return (
    post.text.trim().length >= 70 &&
    !EXCLUDED_TERMS.some((term) => normalized.includes(term)) &&
    !/^rt\s@/i.test(post.text) &&
    (termCount(post.text, AI_TERMS) > 0 || termCount(post.text, SWE_TERMS) > 0)
  );
}

function fingerprint(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3)
    .slice(0, 12)
    .sort()
    .join(" ");
}

export function rankAndSelectPosts(candidates: CandidatePost[], seen: Set<string>, limit = 10): CandidatePost[] {
  const fingerprints = new Set<string>();
  const ranked = candidates
    .filter((post) => !seen.has(post.id) && isUseful(post))
    .map((post) => ({ ...post, category: categorizePost(post.text), score: scorePost(post) }))
    .sort((a, b) => b.score - a.score)
    .filter((post) => {
      const key = fingerprint(post.text);
      if (fingerprints.has(key)) return false;
      fingerprints.add(key);
      return true;
    });

  const targetPerCategory = Math.floor(limit / 2);
  const selected = [
    ...ranked.filter((post) => post.category === "software_engineering").slice(0, targetPerCategory),
    ...ranked.filter((post) => post.category === "ai_ml").slice(0, targetPerCategory),
  ];
  const selectedIds = new Set(selected.map((post) => post.id));
  for (const post of ranked) {
    if (selected.length >= limit) break;
    if (!selectedIds.has(post.id)) {
      selected.push(post);
      selectedIds.add(post.id);
    }
  }
  return selected.sort((a, b) => b.score - a.score);
}

export function selectForYouPosts(candidates: CandidatePost[], seen: Set<string>, limit = 10): CandidatePost[] {
  const fingerprints = new Set<string>();
  return candidates
    .filter((post) => !seen.has(post.id) && isUseful(post))
    .filter((post) => {
      const key = fingerprint(post.text);
      if (fingerprints.has(key)) return false;
      fingerprints.add(key);
      return true;
    })
    .slice(0, limit)
    .map((post, index) => ({
      ...post,
      category: categorizePost(post.text),
      score: limit - index,
    }));
}

export async function fetchCandidatePosts(): Promise<{ posts: CandidatePost[]; source: "for_you" | "fixtures" }> {
  if (process.env.X_USE_FIXTURES === "true") {
    return { posts: fixturePosts, source: "fixtures" };
  }
  const posts = getLatestForYouPosts().map((post) => ({
    ...post,
    category: categorizePost(post.text),
    score: 0,
  }));
  if (posts.length === 0) {
    throw new Error(
      "No X For You posts have been captured yet. Open the For You tab on X, browse the feed with the X Agent Capture extension, then send the captured posts to X Agent.",
    );
  }
  return { posts, source: "for_you" };
}
