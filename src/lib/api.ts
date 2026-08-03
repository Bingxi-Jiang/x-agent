import { NextResponse } from "next/server";

export function apiError(error: unknown, fallbackStatus = 400): NextResponse {
  const message = error instanceof Error ? error.message : "An unexpected error occurred.";
  const status = /not found/i.test(message) ? 404 : fallbackStatus;
  return NextResponse.json({ error: message }, { status });
}
