import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/api";
import { generateBatch } from "@/lib/batches";
import { comparisonStats } from "@/lib/stats";
import { updateVoiceFromBatch } from "@/lib/voice";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const { batchId } = z.object({ batchId: z.number().int().positive() }).parse(await request.json());
    const voice = await updateVoiceFromBatch(batchId);
    const batch = await generateBatch();
    return NextResponse.json({ voice, batch, stats: comparisonStats(batch) });
  } catch (error) {
    return apiError(error);
  }
}
