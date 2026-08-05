import { createHash } from "node:crypto";

import { assertProviderCredential, enabledProviders } from "@/lib/config";
import {
  createBatch,
  getBatch,
  getSettings,
  markBatchFailed,
  markBatchReady,
  saveDraft,
  seenPostIds,
} from "@/lib/db";
import { buildReplyPrompt, readPersistentProfiles } from "@/lib/learning";
import { callModel } from "@/lib/models";
import type { Batch, CandidatePost, Provider } from "@/lib/types";
import { fetchCandidatePosts, rankAndSelectPosts, selectForYouPosts } from "@/lib/x-posts";

interface BatchDependencies {
  fetchPosts: typeof fetchCandidatePosts;
  generate: typeof callModel;
  assertCredential: typeof assertProviderCredential;
}

const productionDependencies: BatchDependencies = {
  fetchPosts: fetchCandidatePosts,
  generate: callModel,
  assertCredential: assertProviderCredential,
};

async function runWithConcurrency(tasks: (() => Promise<void>)[], concurrency: number): Promise<void> {
  let index = 0;
  async function worker() {
    while (index < tasks.length) {
      const task = tasks[index++];
      await task();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
}

async function voiceVersion(): Promise<string> {
  const { voiceProfile } = await readPersistentProfiles();
  return createHash("sha256").update(voiceProfile).digest("hex").slice(0, 12);
}

export async function generateBatchWithDependencies(dependencies: BatchDependencies): Promise<Batch> {
  const settings = getSettings();
  const providers = enabledProviders(settings);
  if (providers.length === 0) throw new Error("At least one reply provider must remain enabled.");
  providers.forEach(dependencies.assertCredential);

  const candidates = await dependencies.fetchPosts();
  const seen = seenPostIds();
  const posts = candidates.source === "for_you"
    ? selectForYouPosts(candidates.posts, seen, 10)
    : rankAndSelectPosts(candidates.posts, seen, 10);
  if (posts.length < 10) {
    throw new Error(
      `Only ${posts.length} unseen, substantive technical posts were available. A batch requires 10; browse farther in X's For You tab and capture the feed again.`,
    );
  }

  const batchId = createBatch(posts, providers, candidates.source, await voiceVersion());
  try {
    const tasks: (() => Promise<void>)[] = [];
    for (const post of posts) {
      const prompt = await buildReplyPrompt(post);
      for (const provider of providers) {
        tasks.push(async () => {
          const reply = await dependencies.generate(provider, prompt.system, prompt.user, 350);
          saveDraft(post.id, provider, reply.trim());
        });
      }
    }
    await runWithConcurrency(tasks, 4);
    markBatchReady(batchId);
  } catch (error) {
    markBatchFailed(batchId);
    throw error;
  }

  return getBatch(batchId)!;
}

export async function generateBatch(): Promise<Batch> {
  return generateBatchWithDependencies(productionDependencies);
}

export function providersForBatch(settings: { useOpenAI: boolean; useClaude: boolean }): Provider[] {
  return enabledProviders(settings);
}
