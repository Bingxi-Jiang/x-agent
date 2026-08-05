import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { generateBatch } from "@/lib/batches";
import { getCurrentBatch, isBatchFullyReviewed, markBatchFailed, markBatchReady } from "@/lib/db";
import { comparisonStats } from "@/lib/stats";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  let replacedBatchId: number | null = null;
  try {
    const input = await request.json().catch(() => ({})) as { replaceCurrent?: boolean };
    const current = getCurrentBatch();
    const currentNeedsReview = current?.status === "ready" && !isBatchFullyReviewed(current.id);
    if (current?.status === "generating") {
      throw new Error("The current batch is still generating.");
    }
    if (currentNeedsReview && !input.replaceCurrent) {
      throw new Error("Finish reviewing the current batch before generating another one.");
    }
    if (currentNeedsReview && input.replaceCurrent) {
      replacedBatchId = current.id;
      markBatchFailed(current.id);
    }
    const batch = await generateBatch();
    return NextResponse.json({ batch, stats: comparisonStats(batch) }, { status: 201 });
  } catch (error) {
    if (replacedBatchId !== null) markBatchReady(replacedBatchId);
    return apiError(error);
  }
}
