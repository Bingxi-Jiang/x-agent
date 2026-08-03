import type { CandidatePost, TopicCategory } from "@/lib/types";

const softwarePosts = [
  ["Database Internals", "db_notes", "A database index is not automatically a performance win. Every index spends write throughput, storage, and cache space. The real question is which access pattern earns that cost."],
  ["Systems Field Notes", "systemsnotes", "Retries turn a temporary failure into a distributed-systems problem. Without idempotency and a bounded retry budget, reliability code can amplify the incident it was meant to contain."],
  ["API Craft", "apicraft", "Good API versioning is mostly about preserving contracts, not adding /v2 to a URL. Compatibility breaks often hide in defaults, ordering, and error semantics."],
  ["Compiler Sketches", "compilersketch", "A faster language does not guarantee a faster service. Allocation behavior, data layout, I/O, and operational tooling can dominate the benchmark result."],
  ["Cloud Margins", "cloudmargins", "Teams often optimize cloud unit prices before they understand utilization. An idle perfectly discounted cluster is still expensive architecture."],
  ["Distributed Systems", "dist_systems", "Exactly-once delivery is usually a property assembled across storage, processing, and side effects—not a checkbox supplied by the message broker."],
  ["Open Source Signals", "oss_signals", "The health of an open-source project is easier to see in issue response time, release discipline, and maintainer succession than in its star count."],
  ["Backend Brief", "backendbrief", "Caching changes correctness boundaries. Once stale data is possible, the product needs an explicit answer for how stale is acceptable and who can invalidate it."],
  ["Platform Engineering", "platformeng", "An internal developer platform succeeds when it removes decisions teams should not need to make. A portal that only wraps tickets is another interface, not leverage."],
  ["Security Engineering", "securebuild", "Passkeys improve authentication, but account recovery remains the real security perimeter. Attackers follow the weakest path around the strongest primitive."],
  ["Latency Budget", "latencybudget", "P99 is not a decorative dashboard metric. In a fan-out service, a small slow tail in each dependency quickly becomes the normal user experience."],
  ["Architecture Notes", "archnotes", "Microservices make organizational boundaries executable. If those boundaries are unclear, the network mostly makes the confusion slower and harder to debug."],
  ["Developer Tools", "devtooling", "The best developer tools reduce the distance between an observation and an action. More dashboards do not help if the next step still requires tribal knowledge."],
  ["Queue Theory", "queuetheory", "Async work hides latency from a request but does not remove it from the system. Queue age is often a better user-impact signal than worker CPU."],
  ["Production Readiness", "prodready", "Feature flags need ownership and expiration dates. Otherwise temporary rollout machinery quietly becomes permanent application state."],
] as const;

const aiPosts = [
  ["LLM Systems", "llmsystems", "A model can improve on a benchmark while the product gets worse. Tool latency, retrieval misses, and failure recovery often dominate the end-to-end experience."],
  ["Agent Engineering", "agenteng", "Agent memory should be treated as a retrieval policy, not an infinite transcript. What the system forgets is as important as what it stores."],
  ["Inference Stack", "inferencestack", "Quantization is not just a model-quality tradeoff. Its value depends on whether the serving stack can convert smaller weights into real throughput at the target batch size."],
  ["Evaluation Lab", "eval_lab", "An LLM eval set becomes stale when teams optimize against it. The hard part is maintaining tests that still represent unseen user behavior."],
  ["RAG Practice", "ragpractice", "Most RAG failures blamed on generation begin earlier: the wrong document was indexed, the chunk lost context, or retrieval optimized lexical similarity instead of answerability."],
  ["ML Infrastructure", "mlinfra", "Training reproducibility requires more than a random seed. Data snapshots, dependency versions, preprocessing, hardware kernels, and evaluation code all belong to the experiment."],
  ["AI Product Notes", "aiproductnotes", "A confident model refusal and a confident wrong answer are both UX failures, but they need different fixes. One is policy calibration; the other is epistemic calibration."],
  ["Coding Agents", "codingagents", "Coding agents are most useful when they can close the verification loop. Generating a patch is cheap; establishing that it preserves the intended behavior is the actual work."],
  ["Multimodal Systems", "multimodalsys", "Multimodal models make the input richer, but observability gets harder. A text log rarely explains whether the failure came from perception, retrieval, or reasoning."],
  ["Model Routing", "modelrouting", "Model routing should optimize for task-level utility, not token price in isolation. A cheaper call that causes another turn or a manual correction may cost more."],
  ["AI Reliability", "aireliability", "Structured output moves uncertainty; it does not eliminate it. The JSON can be valid while the underlying classification is still unsupported."],
  ["Fine-tuning Notes", "finetunenotes", "Before fine-tuning, check whether the missing behavior is knowledge, instruction following, or product context. Each failure points to a different intervention."],
  ["Embeddings Weekly", "embedweekly", "Embedding benchmarks rarely capture the distribution shift inside a specific product. A small labeled set from real retrieval failures is usually more informative."],
  ["Agent Protocols", "agentprotocols", "Giving an agent more tools increases capability and also expands its error surface. Permission boundaries and reversible actions are part of model quality."],
  ["Vision Deployments", "visiondeploy", "Computer-vision accuracy measured on clean frames says little about a deployment with motion blur, compression, occlusion, and changing cameras."],
] as const;

function metrics(index: number) {
  return {
    likes: 2600 - index * 53,
    reposts: 420 - index * 9,
    replies: 96 + (index % 7) * 8,
    quotes: 34 + (index % 5) * 4,
    impressions: 92000 - index * 1300,
  };
}

function makeFixtures(
  entries: readonly (readonly [string, string, string])[],
  category: TopicCategory,
  prefix: string,
): CandidatePost[] {
  return entries.map(([authorName, username, text], index) => {
    const id = `fixture-${prefix}-${String(index + 1).padStart(2, "0")}`;
    return {
      id,
      authorName,
      username,
      text,
      createdAt: new Date(Date.now() - (index + 3) * 60 * 60 * 1000).toISOString(),
      metrics: metrics(index + (category === "ai_ml" ? 2 : 0)),
      url: `https://x.com/${username}/status/${id}`,
      media: [],
      category,
      score: 0,
    };
  });
}

export const fixturePosts: CandidatePost[] = [
  ...makeFixtures(softwarePosts, "software_engineering", "swe"),
  ...makeFixtures(aiPosts, "ai_ml", "ai"),
];
