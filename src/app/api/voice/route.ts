import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/api";
import { getSettings, listVoiceRevisions } from "@/lib/db";
import { readVoiceProfile, saveManualVoiceProfile, voiceProfileVersion } from "@/lib/voice";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    content: await readVoiceProfile(),
    version: await voiceProfileVersion(),
    revisions: listVoiceRevisions(),
    calibrationComplete: getSettings().calibrationComplete,
  });
}

export async function PATCH(request: Request) {
  try {
    const { content } = z.object({ content: z.string() }).parse(await request.json());
    const result = await saveManualVoiceProfile(content);
    return NextResponse.json({ ...result, content: await readVoiceProfile(), revisions: listVoiceRevisions() });
  } catch (error) {
    return apiError(error);
  }
}
