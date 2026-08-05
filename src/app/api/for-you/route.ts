import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/api";
import { getForYouImportStatus, saveForYouImport } from "@/lib/db";

export const runtime = "nodejs";

function extensionRequest(request: Request): boolean {
  const origin = request.headers.get("Origin");
  return !origin || origin === new URL(request.url).origin || origin.startsWith("chrome-extension://");
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin");
  return {
    "Access-Control-Allow-Origin": origin?.startsWith("chrome-extension://") ? origin : new URL(request.url).origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type, X-X-Agent-Token",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  };
}

const metricSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0);
const postSchema = z.object({
  id: z.string().regex(/^\d{1,20}$/),
  authorName: z.string().trim().min(1).max(200),
  username: z.string().trim().regex(/^[A-Za-z0-9_]{1,30}$/),
  text: z.string().trim().min(1).max(25_000),
  createdAt: z.iso.datetime(),
  metrics: z.object({
    likes: metricSchema,
    reposts: metricSchema,
    replies: metricSchema,
    quotes: metricSchema,
    impressions: metricSchema.optional(),
    bookmarks: metricSchema.optional(),
  }),
  url: z.url().refine((value) => {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "x.com" || hostname === "twitter.com" || hostname.endsWith(".x.com");
  }, "Post URL must point to X."),
  media: z.array(z.object({
    type: z.enum(["photo", "video", "animated_gif"]),
    url: z.url().optional(),
    previewUrl: z.url().optional(),
    altText: z.string().max(2_000).optional(),
  })).max(8),
});

const importSchema = z.object({
  capturedAt: z.iso.datetime().optional(),
  posts: z.array(postSchema).min(1).max(250),
});

function authorized(request: Request): boolean {
  const expected = process.env.X_AGENT_IMPORT_TOKEN?.trim();
  if (!expected) return true;
  const actual = request.headers.get("X-X-Agent-Token") ?? "";
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}

export async function OPTIONS(request: Request) {
  if (!extensionRequest(request)) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET() {
  return NextResponse.json(getForYouImportStatus());
}

export async function POST(request: Request) {
  try {
    if (!extensionRequest(request)) {
      return NextResponse.json({ error: "For You imports are accepted only from the X Agent browser extension." }, { status: 403 });
    }
    if (!authorized(request)) {
      return NextResponse.json({ error: "The X Agent import token is missing or incorrect." }, { status: 401, headers: corsHeaders(request) });
    }
    const input = importSchema.parse(await request.json());
    const status = saveForYouImport(input.posts, input.capturedAt);
    return NextResponse.json(status, { status: 201, headers: corsHeaders(request) });
  } catch (error) {
    const response = apiError(error);
    for (const [key, value] of Object.entries(corsHeaders(request))) response.headers.set(key, value);
    return response;
  }
}
