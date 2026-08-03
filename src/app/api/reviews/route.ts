import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/api";
import { getCurrentBatch, saveReview } from "@/lib/db";

export const runtime = "nodejs";

const reviewSchema = z.object({
  postId: z.string().min(1),
  selectedSource: z.enum(["openai", "claude", "manual", "neither"]),
  editedReply: z.string().max(1000).default(""),
  replacementReply: z.string().max(1000).default(""),
  feedbackCategory: z.enum([
    "sounds_like_me",
    "does_not_sound_like_me",
    "good_idea_wrong_wording",
    "would_not_reply",
  ]),
  writtenFeedback: z.string().max(2000).default(""),
  wouldReply: z.boolean(),
});

export async function POST(request: Request) {
  try {
    const input = reviewSchema.parse(await request.json());
    const batch = getCurrentBatch();
    const post = batch?.posts.find((item) => item.id === input.postId);
    if (!post) throw new Error("Post not found in the current batch.");
    if ((input.selectedSource === "openai" || input.selectedSource === "claude") && !post.drafts[input.selectedSource]) {
      throw new Error(`No ${input.selectedSource === "openai" ? "OpenAI" : "Claude"} draft exists for this post.`);
    }
    if (input.selectedSource === "manual" && !input.replacementReply.trim() && !input.editedReply.trim()) {
      throw new Error("Write a manual or replacement reply before selecting Manual.");
    }
    const selectedReply =
      input.selectedSource === "openai" || input.selectedSource === "claude"
        ? post.drafts[input.selectedSource]!.content
        : input.selectedSource === "manual"
          ? input.replacementReply.trim() || input.editedReply.trim()
          : "";
    const review = saveReview({
      ...input,
      selectedReply,
      wouldReply: input.feedbackCategory === "would_not_reply" ? false : input.wouldReply,
    });
    return NextResponse.json({ review });
  } catch (error) {
    return apiError(error);
  }
}
