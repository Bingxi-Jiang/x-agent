import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { listVoiceRevisions } from "@/lib/db";
import { readVoiceProfile, restoreVoiceProfile } from "@/lib/voice";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = Number((await context.params).id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid voice revision ID.");
    const result = await restoreVoiceProfile(id);
    return NextResponse.json({ ...result, content: await readVoiceProfile(), revisions: listVoiceRevisions() });
  } catch (error) {
    return apiError(error);
  }
}
