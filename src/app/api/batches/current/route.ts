import { NextResponse } from "next/server";

import { getCurrentBatch } from "@/lib/db";
import { comparisonStats } from "@/lib/stats";

export const runtime = "nodejs";

export async function GET() {
  const batch = getCurrentBatch();
  return NextResponse.json({ batch, stats: comparisonStats(batch) });
}
