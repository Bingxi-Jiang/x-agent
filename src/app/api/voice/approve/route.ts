import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { approveCurrentVoiceProfile } from "@/lib/voice";

export const runtime = "nodejs";

export async function POST() {
  try {
    const revision = await approveCurrentVoiceProfile();
    return NextResponse.json({
      revision,
      message: "PJ Voice is approved. X Agent is ready for a later live-operation phase; nothing was published.",
    });
  } catch (error) {
    return apiError(error);
  }
}
