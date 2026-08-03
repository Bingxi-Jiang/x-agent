import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { generateBatch } from "@/lib/batches";
import { getCurrentBatch, isBatchFullyReviewed } from "@/lib/db";
import { comparisonStats } from "@/lib/stats";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST() {
  try {
    const current = getCurrentBatch();
    if (current?.status === "ready" && !isBatchFullyReviewed(current.id)) {
      throw new Error("Finish reviewing the current batch before generating another one.");
    }
    const batch = await generateBatch();
    return NextResponse.json({ batch, stats: comparisonStats(batch) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
