import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/api";
import { credentialStatus, modelName } from "@/lib/config";
import { getSettings, saveSettings } from "@/lib/db";

export const runtime = "nodejs";

const settingsSchema = z.object({
  useOpenAI: z.boolean(),
  useClaude: z.boolean(),
  voiceUpdateProvider: z.enum(["openai", "claude"]),
});

function responseBody() {
  return {
    settings: getSettings(),
    credentials: credentialStatus(),
    models: { openai: modelName("openai"), claude: modelName("claude") },
  };
}

export async function GET() {
  return NextResponse.json(responseBody());
}

export async function PUT(request: Request) {
  try {
    saveSettings(settingsSchema.parse(await request.json()));
    return NextResponse.json(responseBody());
  } catch (error) {
    return apiError(error);
  }
}
