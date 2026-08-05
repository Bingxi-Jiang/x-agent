import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { databasePath } from "@/lib/config";
import type {
  Batch,
  BatchPost,
  CandidatePost,
  CapturedForYouPost,
  Draft,
  ForYouImportStatus,
  Provider,
  ProviderSettings,
  ReviewInput,
  SavedReview,
  VoiceRevision,
} from "@/lib/types";

type SqlValue = string | number | bigint | null | Uint8Array;

declare global {
  var xAgentDatabases: Map<string, DatabaseSync> | undefined;
}

const schema = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    use_openai INTEGER NOT NULL DEFAULT 1,
    use_claude INTEGER NOT NULL DEFAULT 1,
    voice_update_provider TEXT NOT NULL DEFAULT 'openai' CHECK (voice_update_provider IN ('openai', 'claude')),
    calibration_complete INTEGER NOT NULL DEFAULT 0,
    approved_revision_id INTEGER,
    updated_at TEXT NOT NULL,
    CHECK (use_openai = 1 OR use_claude = 1)
  );

  CREATE TABLE IF NOT EXISTS batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    status TEXT NOT NULL CHECK (status IN ('generating', 'ready', 'reviewed', 'failed')),
    providers_json TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('x_api', 'fixtures')),
    feed_source TEXT CHECK (feed_source IS NULL OR feed_source = 'for_you'),
    voice_version TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    batch_id INTEGER NOT NULL REFERENCES batches(id),
    author_name TEXT NOT NULL,
    username TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL,
    metrics_json TEXT NOT NULL,
    url TEXT NOT NULL,
    media_json TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('software_engineering', 'ai_ml')),
    score REAL NOT NULL
  );

  CREATE INDEX IF NOT EXISTS posts_batch_idx ON posts(batch_id);

  CREATE TABLE IF NOT EXISTS drafts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id TEXT NOT NULL REFERENCES posts(id),
    provider TEXT NOT NULL CHECK (provider IN ('openai', 'claude')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(post_id, provider)
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id TEXT NOT NULL UNIQUE REFERENCES posts(id),
    selected_source TEXT NOT NULL CHECK (selected_source IN ('openai', 'claude', 'manual', 'neither')),
    selected_reply TEXT NOT NULL,
    edited_reply TEXT NOT NULL,
    replacement_reply TEXT NOT NULL,
    feedback_category TEXT NOT NULL CHECK (feedback_category IN ('sounds_like_me', 'does_not_sound_like_me', 'good_idea_wrong_wording', 'would_not_reply')),
    written_feedback TEXT NOT NULL,
    would_reply INTEGER NOT NULL,
    reviewed_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS voice_revisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL UNIQUE,
    content TEXT NOT NULL,
    summary TEXT NOT NULL,
    approved INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS for_you_imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    captured_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS for_you_posts (
    import_id INTEGER NOT NULL REFERENCES for_you_imports(id),
    post_id TEXT NOT NULL,
    feed_position INTEGER NOT NULL,
    author_name TEXT NOT NULL,
    username TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL,
    metrics_json TEXT NOT NULL,
    url TEXT NOT NULL,
    media_json TEXT NOT NULL,
    PRIMARY KEY (import_id, post_id)
  );

  CREATE INDEX IF NOT EXISTS for_you_posts_import_idx ON for_you_posts(import_id, feed_position);
`;

function now(): string {
  return new Date().toISOString();
}

export function getDatabase(): DatabaseSync {
  const filename = path.resolve(databasePath());
  mkdirSync(path.dirname(filename), { recursive: true });
  globalThis.xAgentDatabases ??= new Map();
  const existing = globalThis.xAgentDatabases.get(filename);
  if (existing) return existing;

  const database = new DatabaseSync(filename);
  database.exec(schema);
  const batchColumns = database.prepare("PRAGMA table_info(batches)").all() as { name: string }[];
  if (!batchColumns.some((column) => column.name === "feed_source")) {
    database.exec("ALTER TABLE batches ADD COLUMN feed_source TEXT");
  }
  database
    .prepare(
      `INSERT OR IGNORE INTO settings
       (id, use_openai, use_claude, voice_update_provider, calibration_complete, updated_at)
       VALUES (1, 1, 1, 'openai', 0, ?)`,
    )
    .run(now());
  globalThis.xAgentDatabases.set(filename, database);
  return database;
}

export function getSettings(): ProviderSettings {
  const row = getDatabase().prepare("SELECT * FROM settings WHERE id = 1").get() as Record<string, SqlValue>;
  return {
    useOpenAI: Boolean(row.use_openai),
    useClaude: Boolean(row.use_claude),
    voiceUpdateProvider: String(row.voice_update_provider) as Provider,
    calibrationComplete: Boolean(row.calibration_complete),
    approvedRevisionId: row.approved_revision_id === null ? null : Number(row.approved_revision_id),
    updatedAt: String(row.updated_at),
  };
}

export function saveSettings(input: Pick<ProviderSettings, "useOpenAI" | "useClaude" | "voiceUpdateProvider">): ProviderSettings {
  if (!input.useOpenAI && !input.useClaude) {
    throw new Error("At least one reply provider must remain enabled.");
  }
  getDatabase()
    .prepare(
      `UPDATE settings SET use_openai = ?, use_claude = ?, voice_update_provider = ?, updated_at = ? WHERE id = 1`,
    )
    .run(Number(input.useOpenAI), Number(input.useClaude), input.voiceUpdateProvider, now());
  return getSettings();
}

export function createBatch(
  posts: CandidatePost[],
  providers: Provider[],
  source: Batch["source"],
  voiceVersion: string,
): number {
  const db = getDatabase();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = db
      .prepare(
        `INSERT INTO batches (created_at, status, providers_json, source, feed_source, voice_version)
         VALUES (?, 'generating', ?, ?, ?, ?)`,
      )
      .run(now(), JSON.stringify(providers), source === "fixtures" ? "fixtures" : "x_api", source === "for_you" ? "for_you" : null, voiceVersion);
    const batchId = Number(result.lastInsertRowid);
    const insert = db.prepare(
      `INSERT INTO posts
       (id, batch_id, author_name, username, text, created_at, metrics_json, url, media_json, category, score)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const post of posts) {
      insert.run(
        post.id,
        batchId,
        post.authorName,
        post.username,
        post.text,
        post.createdAt,
        JSON.stringify(post.metrics),
        post.url,
        JSON.stringify(post.media),
        post.category,
        post.score,
      );
    }
    db.exec("COMMIT");
    return batchId;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function saveDraft(postId: string, provider: Provider, content: string): void {
  getDatabase()
    .prepare(
      `INSERT INTO drafts (post_id, provider, content, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(post_id, provider) DO UPDATE SET content = excluded.content, created_at = excluded.created_at`,
    )
    .run(postId, provider, content, now());
}

export function markBatchReady(batchId: number): void {
  getDatabase().prepare("UPDATE batches SET status = 'ready' WHERE id = ?").run(batchId);
}

export function markBatchFailed(batchId: number): void {
  getDatabase().prepare("UPDATE batches SET status = 'failed' WHERE id = ?").run(batchId);
}

function mapReview(row: Record<string, SqlValue> | undefined): SavedReview | null {
  if (!row) return null;
  return {
    id: Number(row.id),
    postId: String(row.post_id),
    selectedSource: String(row.selected_source) as SavedReview["selectedSource"],
    selectedReply: String(row.selected_reply),
    editedReply: String(row.edited_reply),
    replacementReply: String(row.replacement_reply),
    feedbackCategory: String(row.feedback_category) as SavedReview["feedbackCategory"],
    writtenFeedback: String(row.written_feedback),
    wouldReply: Boolean(row.would_reply),
    reviewedAt: String(row.reviewed_at),
  };
}

function getPostsForBatch(batchId: number): BatchPost[] {
  const db = getDatabase();
  const rows = db.prepare("SELECT * FROM posts WHERE batch_id = ? ORDER BY score DESC").all(batchId) as Record<
    string,
    SqlValue
  >[];
  const draftStatement = db.prepare("SELECT * FROM drafts WHERE post_id = ? ORDER BY id");
  const reviewStatement = db.prepare("SELECT * FROM reviews WHERE post_id = ?");

  return rows.map((row) => {
    const draftRows = draftStatement.all(String(row.id)) as Record<string, SqlValue>[];
    const drafts: Partial<Record<Provider, Draft>> = {};
    for (const draft of draftRows) {
      const provider = String(draft.provider) as Provider;
      drafts[provider] = {
        id: Number(draft.id),
        provider,
        content: String(draft.content),
        createdAt: String(draft.created_at),
      };
    }
    return {
      id: String(row.id),
      authorName: String(row.author_name),
      username: String(row.username),
      text: String(row.text),
      createdAt: String(row.created_at),
      metrics: JSON.parse(String(row.metrics_json)),
      url: String(row.url),
      media: JSON.parse(String(row.media_json)),
      category: String(row.category) as BatchPost["category"],
      score: Number(row.score),
      drafts,
      review: mapReview(reviewStatement.get(String(row.id)) as Record<string, SqlValue> | undefined),
    };
  });
}

export function getBatch(batchId: number): Batch | null {
  const row = getDatabase().prepare("SELECT * FROM batches WHERE id = ?").get(batchId) as
    | Record<string, SqlValue>
    | undefined;
  if (!row) return null;
  return {
    id: Number(row.id),
    createdAt: String(row.created_at),
    completedAt: row.completed_at === null ? null : String(row.completed_at),
    status: String(row.status) as Batch["status"],
    providers: JSON.parse(String(row.providers_json)),
    source: row.feed_source === "for_you" ? "for_you" : String(row.source) as Batch["source"],
    voiceVersion: String(row.voice_version),
    posts: getPostsForBatch(Number(row.id)),
  };
}

export function getCurrentBatch(): Batch | null {
  const row = getDatabase()
    .prepare("SELECT id FROM batches WHERE status != 'failed' ORDER BY id DESC LIMIT 1")
    .get() as { id: number } | undefined;
  return row ? getBatch(Number(row.id)) : null;
}

export function listBatches(limit = 20): Batch[] {
  const rows = getDatabase().prepare("SELECT id FROM batches ORDER BY id DESC LIMIT ?").all(limit) as { id: number }[];
  return rows.map((row) => getBatch(Number(row.id))).filter((batch): batch is Batch => Boolean(batch));
}

export function saveReview(input: ReviewInput): SavedReview {
  const db = getDatabase();
  const post = db.prepare("SELECT batch_id FROM posts WHERE id = ?").get(input.postId) as
    | { batch_id: number }
    | undefined;
  if (!post) throw new Error("Post not found.");

  const reviewedAt = now();
  db.prepare(
    `INSERT INTO reviews
     (post_id, selected_source, selected_reply, edited_reply, replacement_reply, feedback_category, written_feedback, would_reply, reviewed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(post_id) DO UPDATE SET
       selected_source = excluded.selected_source,
       selected_reply = excluded.selected_reply,
       edited_reply = excluded.edited_reply,
       replacement_reply = excluded.replacement_reply,
       feedback_category = excluded.feedback_category,
       written_feedback = excluded.written_feedback,
       would_reply = excluded.would_reply,
       reviewed_at = excluded.reviewed_at`,
  ).run(
    input.postId,
    input.selectedSource,
    input.selectedReply,
    input.editedReply,
    input.replacementReply,
    input.feedbackCategory,
    input.writtenFeedback,
    Number(input.wouldReply),
    reviewedAt,
  );

  const counts = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN reviews.id IS NOT NULL THEN 1 ELSE 0 END) AS reviewed
       FROM posts LEFT JOIN reviews ON reviews.post_id = posts.id WHERE posts.batch_id = ?`,
    )
    .get(Number(post.batch_id)) as { total: number; reviewed: number };
  if (Number(counts.total) === Number(counts.reviewed)) {
    db.prepare("UPDATE batches SET status = 'reviewed', completed_at = ? WHERE id = ?").run(reviewedAt, Number(post.batch_id));
  }

  const row = db.prepare("SELECT * FROM reviews WHERE post_id = ?").get(input.postId) as Record<string, SqlValue>;
  return mapReview(row)!;
}

export function isBatchFullyReviewed(batchId: number): boolean {
  const row = getDatabase()
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN reviews.id IS NOT NULL THEN 1 ELSE 0 END) AS reviewed
       FROM posts LEFT JOIN reviews ON reviews.post_id = posts.id WHERE posts.batch_id = ?`,
    )
    .get(batchId) as { total: number; reviewed: number | null };
  return Number(row.total) > 0 && Number(row.total) === Number(row.reviewed ?? 0);
}

export function seenPostIds(): Set<string> {
  const rows = getDatabase().prepare("SELECT id FROM posts").all() as { id: string }[];
  return new Set(rows.map((row) => String(row.id)));
}

export function saveForYouImport(posts: CapturedForYouPost[], capturedAt = now()): ForYouImportStatus {
  const db = getDatabase();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = db.prepare("INSERT INTO for_you_imports (captured_at) VALUES (?)").run(capturedAt);
    const importId = Number(result.lastInsertRowid);
    const insert = db.prepare(
      `INSERT INTO for_you_posts
       (import_id, post_id, feed_position, author_name, username, text, created_at, metrics_json, url, media_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const unique = new Set<string>();
    let position = 0;
    for (const post of posts) {
      if (unique.has(post.id)) continue;
      unique.add(post.id);
      insert.run(
        importId,
        post.id,
        position++,
        post.authorName,
        post.username,
        post.text,
        post.createdAt,
        JSON.stringify(post.metrics),
        post.url,
        JSON.stringify(post.media),
      );
    }
    db.exec("COMMIT");
    return { importId, capturedAt, postCount: unique.size };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function getForYouImportStatus(): ForYouImportStatus {
  const row = getDatabase()
    .prepare(
      `SELECT for_you_imports.id, for_you_imports.captured_at, COUNT(for_you_posts.post_id) AS post_count
       FROM for_you_imports
       LEFT JOIN for_you_posts ON for_you_posts.import_id = for_you_imports.id
       GROUP BY for_you_imports.id
       ORDER BY for_you_imports.id DESC LIMIT 1`,
    )
    .get() as Record<string, SqlValue> | undefined;
  if (!row) return { importId: null, capturedAt: null, postCount: 0 };
  return {
    importId: Number(row.id),
    capturedAt: String(row.captured_at),
    postCount: Number(row.post_count),
  };
}

export function getLatestForYouPosts(): CapturedForYouPost[] {
  const status = getForYouImportStatus();
  if (status.importId === null) return [];
  const rows = getDatabase()
    .prepare("SELECT * FROM for_you_posts WHERE import_id = ? ORDER BY feed_position")
    .all(status.importId) as Record<string, SqlValue>[];
  return rows.map((row) => ({
    id: String(row.post_id),
    authorName: String(row.author_name),
    username: String(row.username),
    text: String(row.text),
    createdAt: String(row.created_at),
    metrics: JSON.parse(String(row.metrics_json)),
    url: String(row.url),
    media: JSON.parse(String(row.media_json)),
  }));
}

export function insertVoiceRevision(
  filename: string,
  content: string,
  summary: string,
  approved = false,
): VoiceRevision {
  const db = getDatabase();
  const createdAt = now();
  const result = db
    .prepare(
      `INSERT INTO voice_revisions (filename, content, summary, approved, created_at) VALUES (?, ?, ?, ?, ?)`,
    )
    .run(filename, content, summary, Number(approved), createdAt);
  return {
    id: Number(result.lastInsertRowid),
    filename,
    content,
    summary,
    approved,
    createdAt,
  };
}

export function listVoiceRevisions(): VoiceRevision[] {
  const rows = getDatabase().prepare("SELECT * FROM voice_revisions ORDER BY id DESC").all() as Record<
    string,
    SqlValue
  >[];
  return rows.map((row) => ({
    id: Number(row.id),
    filename: String(row.filename),
    content: String(row.content),
    summary: String(row.summary),
    approved: Boolean(row.approved),
    createdAt: String(row.created_at),
  }));
}

export function getVoiceRevision(id: number): VoiceRevision | null {
  const row = getDatabase().prepare("SELECT * FROM voice_revisions WHERE id = ?").get(id) as
    | Record<string, SqlValue>
    | undefined;
  if (!row) return null;
  return {
    id: Number(row.id),
    filename: String(row.filename),
    content: String(row.content),
    summary: String(row.summary),
    approved: Boolean(row.approved),
    createdAt: String(row.created_at),
  };
}

export function approveVoiceRevision(id: number): void {
  const db = getDatabase();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE voice_revisions SET approved = 0").run();
    db.prepare("UPDATE voice_revisions SET approved = 1 WHERE id = ?").run(id);
    db.prepare(
      "UPDATE settings SET calibration_complete = 1, approved_revision_id = ?, updated_at = ? WHERE id = 1",
    ).run(id, now());
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function recentReviewedRows(limit = 80): Record<string, SqlValue>[] {
  return getDatabase()
    .prepare(
      `SELECT reviews.*, posts.text AS source_post, posts.category, posts.batch_id,
              openai.content AS openai_reply, claude.content AS claude_reply
       FROM reviews
       JOIN posts ON posts.id = reviews.post_id
       LEFT JOIN drafts openai ON openai.post_id = posts.id AND openai.provider = 'openai'
       LEFT JOIN drafts claude ON claude.post_id = posts.id AND claude.provider = 'claude'
       ORDER BY reviews.id DESC LIMIT ?`,
    )
    .all(limit) as Record<string, SqlValue>[];
}
