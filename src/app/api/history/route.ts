import { NextResponse } from "next/server";

import { listBatches } from "@/lib/db";
import { comparisonStats } from "@/lib/stats";

export const runtime = "nodejs";

export async function GET() {
  const batches = listBatches(20);
  return NextResponse.json({
    batches: batches.map((batch) => ({ ...batch, stats: comparisonStats(batch) })),
  });
}
