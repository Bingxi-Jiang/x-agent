import { fixturePosts } from "@/lib/fixtures";
import type { CandidatePost, EngagementMetrics, PostMedia, TopicCategory } from "@/lib/types";

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

interface XTweet {
  id: string;
  text: string;
  author_id: string;
  created_at: string;
  public_metrics?: {
    like_count?: number;
    retweet_count?: number;
    reply_count?: number;
    quote_count?: number;
    impression_count?: number;
    bookmark_count?: number;
  };
  attachments?: { media_keys?: string[] };
}

interface XUser {
  id: string;
  name: string;
  username: string;
}

interface XMedia {
  media_key: string;
  type: PostMedia["type"];
  url?: string;
  preview_image_url?: string;
  alt_text?: string;
}

interface XSearchResponse {
  data?: XTweet[];
  includes?: { users?: XUser[]; media?: XMedia[] };
  errors?: { title?: string; detail?: string }[];
}

function mapXResponse(payload: XSearchResponse): CandidatePost[] {
  const users = new Map((payload.includes?.users ?? []).map((user) => [user.id, user]));
  const media = new Map((payload.includes?.media ?? []).map((item) => [item.media_key, item]));
  return (payload.data ?? []).map((tweet) => {
    const user = users.get(tweet.author_id);
    const username = user?.username ?? "unknown";
    const sourceMetrics = tweet.public_metrics ?? {};
    const metrics: EngagementMetrics = {
      likes: sourceMetrics.like_count ?? 0,
      reposts: sourceMetrics.retweet_count ?? 0,
      replies: sourceMetrics.reply_count ?? 0,
      quotes: sourceMetrics.quote_count ?? 0,
      impressions: sourceMetrics.impression_count,
      bookmarks: sourceMetrics.bookmark_count,
    };
    return {
      id: tweet.id,
      authorName: user?.name ?? username,
      username,
      text: tweet.text,
      createdAt: tweet.created_at,
      metrics,
      url: `https://x.com/${username}/status/${tweet.id}`,
      media: (tweet.attachments?.media_keys ?? [])
        .map((key) => media.get(key))
        .filter((item): item is XMedia => Boolean(item))
        .map((item) => ({
          type: item.type,
          url: item.url,
          previewUrl: item.preview_image_url,
          altText: item.alt_text,
        })),
      category: categorizePost(tweet.text),
      score: 0,
    };
  });
}

async function searchX(query: string, token: string): Promise<CandidatePost[]> {
  const params = new URLSearchParams({
    query,
    max_results: "50",
    expansions: "author_id,attachments.media_keys",
    "tweet.fields": "author_id,created_at,lang,public_metrics,attachments",
    "user.fields": "name,username",
    "media.fields": "type,url,preview_image_url,alt_text",
  });
  const response = await fetch(`https://api.x.com/2/tweets/search/recent?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  });
  const payload = (await response.json()) as XSearchResponse;
  if (!response.ok) {
    const detail = payload.errors?.map((error) => error.detail ?? error.title).filter(Boolean).join("; ");
    throw new Error(`X recent search failed (${response.status})${detail ? `: ${detail}` : "."}`);
  }
  return mapXResponse(payload);
}

export async function fetchCandidatePosts(): Promise<{ posts: CandidatePost[]; source: "x_api" | "fixtures" }> {
  if (process.env.X_USE_FIXTURES === "true") {
    return { posts: fixturePosts, source: "fixtures" };
  }
  const token = process.env.X_BEARER_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "X_BEARER_TOKEN is required for official X recent search. For local UI calibration only, set X_USE_FIXTURES=true.",
    );
  }

  const [software, ai] = await Promise.all([
    searchX(
      '("software engineering" OR backend OR database OR API OR "distributed systems" OR "developer tools" OR cloud) lang:en -is:retweet',
      token,
    ),
    searchX(
      '(LLM OR "AI agent" OR "machine learning" OR inference OR RAG OR multimodal OR "AI coding") lang:en -is:retweet',
      token,
    ),
  ]);
  return { posts: [...software, ...ai], source: "x_api" };
}
