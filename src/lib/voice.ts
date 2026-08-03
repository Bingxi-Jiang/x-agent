import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { credentialStatus } from "@/lib/config";
import {
  approveVoiceRevision,
  getBatch,
  getSettings,
  getVoiceRevision,
  insertVoiceRevision,
  isBatchFullyReviewed,
  recentReviewedRows,
} from "@/lib/db";
import { callModel, parseModelJson } from "@/lib/models";
import type { Provider, VoiceRevision } from "@/lib/types";

const updateSchema = z.object({
  meaningfulChange: z.boolean(),
  changeSummary: z.string().min(1),
  profileMarkdown: z.string().min(200),
});

function voiceFile(): string {
  return path.join(process.cwd(), "data", "pj-voice.md");
}

function revisionDirectory(): string {
  return path.join(process.cwd(), "data", "voice-revisions");
}

function timestamp(): string {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

function filename(prefix: string): string {
  return `${prefix}-${timestamp()}-${randomUUID().slice(0, 6)}.md`;
}

export async function readVoiceProfile(): Promise<string> {
  return readFile(voiceFile(), "utf8");
}

export async function voiceProfileVersion(): Promise<string> {
  return createHash("sha256").update(await readVoiceProfile()).digest("hex").slice(0, 12);
}

async function archiveContent(
  content: string,
  summary: string,
  prefix = "revision",
  approved = false,
): Promise<VoiceRevision> {
  await mkdir(revisionDirectory(), { recursive: true });
  const archiveName = filename(prefix);
  await writeFile(path.join(revisionDirectory(), archiveName), content, "utf8");
  return insertVoiceRevision(archiveName, content, summary, approved);
}

async function archiveCurrent(summary: string): Promise<VoiceRevision> {
  return archiveContent(await readVoiceProfile(), summary);
}

function selectedReply(row: Record<string, unknown>): string {
  return (
    String(row.replacement_reply ?? "").trim() ||
    String(row.edited_reply ?? "").trim() ||
    String(row.selected_reply ?? "").trim()
  );
}

function batchEvidence(batchId: number): string {
  const rows = recentReviewedRows(80).filter((row) => Number(row.batch_id) === batchId);
  return rows
    .map(
      (row, index) =>
        `Review ${index + 1}\nSource post: ${String(row.source_post)}\nOpenAI draft: ${String(row.openai_reply ?? "[not generated]")}\nClaude draft: ${String(row.claude_reply ?? "[not generated]")}\nSelected source: ${String(row.selected_source)}\nFinal or preferred wording: ${selectedReply(row)}\nWould reply: ${Boolean(row.would_reply)}\nRating: ${String(row.feedback_category)}\nWritten feedback: ${String(row.written_feedback || "[none]")}`,
    )
    .join("\n\n");
}

export function assertVoiceProviderAvailable(provider: Provider): void {
  const settings = getSettings();
  const enabled = provider === "openai" ? settings.useOpenAI : settings.useClaude;
  if (!enabled) {
    throw new Error(
      `The selected voice-update provider (${provider === "openai" ? "OpenAI" : "Claude"}) is disabled. Select an enabled provider before updating the voice profile.`,
    );
  }
  if (!credentialStatus()[provider]) {
    const variable = provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY";
    throw new Error(`${variable} is required to update the voice profile with the selected provider.`);
  }
}

export async function updateVoiceFromBatch(batchId: number): Promise<{
  changed: boolean;
  summary: string;
  version: string;
}> {
  const batch = getBatch(batchId);
  if (!batch) throw new Error("Batch not found.");
  if (!isBatchFullyReviewed(batchId)) throw new Error("Review every post in the current batch before updating PJ Voice.");

  const provider = getSettings().voiceUpdateProvider;
  assertVoiceProviderAvailable(provider);
  const previous = await readVoiceProfile();
  const evidence = batchEvidence(batchId);
  const system = `You revise a persistent writing-style profile from a completed feedback batch. This is instruction/profile revision, not model fine-tuning. Return only JSON with keys meaningfulChange (boolean), changeSummary (a concise user-facing sentence or short paragraph), and profileMarkdown (the complete updated profile). Preserve useful existing rules. Do not convert an isolated edit into a stable rule. Keep separate Markdown sections for Stable preferences, Newly observed preferences, Topic-specific preferences, Uncertain patterns, Rejected wording and habits, Opinion strength and reasoning, Topic preferences, and Representative examples. If evidence shows no meaningful pattern, set meaningfulChange false, explain why, and return the prior profile unchanged.`;
  const user = `Previous PJ voice profile:\n\n${previous}\n\nCompleted batch feedback (${batch.posts.length} items only):\n\n${evidence}\n\nCompare drafts, selections, edits, replacements, no-reply decisions, ratings, and written feedback. Update only for meaningful patterns.`;
  const raw = await callModel(provider, system, user, 2600);
  const result = updateSchema.parse(parseModelJson(raw));

  if (!result.meaningfulChange || result.profileMarkdown.trim() === previous.trim()) {
    return { changed: false, summary: result.changeSummary, version: await voiceProfileVersion() };
  }

  await archiveCurrent(`Profile before learning from batch ${batchId}.`);
  await writeFile(voiceFile(), `${result.profileMarkdown.trim()}\n`, "utf8");
  return { changed: true, summary: result.changeSummary, version: await voiceProfileVersion() };
}

export async function saveManualVoiceProfile(content: string): Promise<{ summary: string; version: string }> {
  const normalized = content.trim();
  if (normalized.length < 200 || !normalized.startsWith("#")) {
    throw new Error("The voice profile must be Markdown beginning with a heading and contain at least 200 characters.");
  }
  const current = await readVoiceProfile();
  if (current.trim() === normalized) {
    return { summary: "No changes were made to the voice profile.", version: await voiceProfileVersion() };
  }
  await archiveCurrent("Profile before Paul's manual edit.");
  await writeFile(voiceFile(), `${normalized}\n`, "utf8");
  return { summary: "Paul’s manual voice-profile edit was saved.", version: await voiceProfileVersion() };
}

export async function restoreVoiceProfile(revisionId: number): Promise<{ summary: string; version: string }> {
  const revision = getVoiceRevision(revisionId);
  if (!revision) throw new Error("Voice revision not found.");
  await archiveCurrent(`Profile before restoring ${revision.filename}.`);
  await writeFile(voiceFile(), revision.content, "utf8");
  return { summary: `Restored ${revision.filename}.`, version: await voiceProfileVersion() };
}

export async function approveCurrentVoiceProfile(): Promise<VoiceRevision> {
  const content = await readVoiceProfile();
  const revision = await archiveContent(
    content,
    "Approved by Paul as the current calibrated voice.",
    "approved",
    true,
  );
  approveVoiceRevision(revision.id);
  return revision;
}
