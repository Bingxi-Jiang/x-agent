import type { Batch, ComparisonStats, Provider, ProviderStats } from "@/lib/types";

function editDistance(a: string, b: string): number {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + Number(a[i - 1] !== b[j - 1]));
      diagonal = above;
    }
  }
  return previous[b.length];
}

function rate(value: number, denominator: number): number {
  return denominator ? Math.round((value / denominator) * 1000) / 10 : 0;
}

function statsForProvider(batch: Batch, provider: Provider): ProviderStats {
  const reviewedPosts = batch.posts.filter((post) => post.review && post.drafts[provider]);
  const selectedPosts = reviewedPosts.filter((post) => post.review!.selectedSource === provider);
  const soundsLike = selectedPosts.filter((post) => post.review!.feedbackCategory === "sounds_like_me").length;
  const rejected = reviewedPosts.filter((post) => post.review!.selectedSource !== provider).length;
  const edits = selectedPosts.map((post) => {
    const draft = post.drafts[provider]!.content;
    const final = post.review!.replacementReply || post.review!.editedReply || post.review!.selectedReply;
    return rate(editDistance(draft, final), Math.max(draft.length, final.length, 1));
  });
  return {
    selected: selectedPosts.length,
    soundsLikeMeRate: rate(soundsLike, reviewedPosts.length),
    rejectionRate: rate(rejected, reviewedPosts.length),
    averageEditPercent: edits.length ? Math.round((edits.reduce((sum, value) => sum + value, 0) / edits.length) * 10) / 10 : 0,
  };
}

export function comparisonStats(batch: Batch | null): ComparisonStats {
  if (!batch) {
    return {
      batchId: null,
      reviewed: 0,
      total: 0,
      openai: null,
      claude: null,
      neitherSelected: 0,
      manualReplacements: 0,
    };
  }
  const reviews = batch.posts.flatMap((post) => (post.review ? [post.review] : []));
  return {
    batchId: batch.id,
    reviewed: reviews.length,
    total: batch.posts.length,
    openai: batch.providers.includes("openai") ? statsForProvider(batch, "openai") : null,
    claude: batch.providers.includes("claude") ? statsForProvider(batch, "claude") : null,
    neitherSelected: reviews.filter((review) => review.selectedSource === "neither").length,
    manualReplacements: reviews.filter(
      (review) => review.selectedSource === "manual" || Boolean(review.replacementReply.trim()),
    ).length,
  };
}
