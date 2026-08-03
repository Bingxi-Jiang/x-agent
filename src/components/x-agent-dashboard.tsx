"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  Batch,
  BatchPost,
  ComparisonStats,
  CredentialStatus,
  FeedbackCategory,
  Provider,
  ProviderSettings,
  SavedReview,
  SelectionSource,
  VoiceRevision,
} from "@/lib/types";

type Tab = "review" | "voice" | "history";

interface SettingsPayload {
  settings: ProviderSettings;
  credentials: CredentialStatus;
  models: Record<Provider, string>;
}

interface VoicePayload {
  content: string;
  version: string;
  revisions: VoiceRevision[];
  calibrationComplete: boolean;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
  return payload;
}

function providerName(provider: Provider): string {
  return provider === "openai" ? "OpenAI" : "Claude";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatNumber(value: number | undefined): string {
  if (value === undefined) return "—";
  return new Intl.NumberFormat("en-US", { notation: value >= 1000 ? "compact" : "standard" }).format(value);
}

function ProviderSettingsPanel({
  payload,
  busy,
  onSave,
}: {
  payload: SettingsPayload;
  busy: boolean;
  onSave: (settings: Pick<ProviderSettings, "useOpenAI" | "useClaude" | "voiceUpdateProvider">) => Promise<void>;
}) {
  const [draft, setDraft] = useState({
    useOpenAI: payload.settings.useOpenAI,
    useClaude: payload.settings.useClaude,
    voiceUpdateProvider: payload.settings.voiceUpdateProvider,
  });

  useEffect(() => {
    setDraft({
      useOpenAI: payload.settings.useOpenAI,
      useClaude: payload.settings.useClaude,
      voiceUpdateProvider: payload.settings.voiceUpdateProvider,
    });
  }, [payload]);

  const voiceEnabled = draft.voiceUpdateProvider === "openai" ? draft.useOpenAI : draft.useClaude;
  const voiceCredential = payload.credentials[draft.voiceUpdateProvider];

  return (
    <section className="settings-panel" aria-labelledby="provider-settings-title">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">GENERATION CONTROL</p>
          <h2 id="provider-settings-title">Model providers</h2>
        </div>
        <button className="button secondary" disabled={busy || (!draft.useOpenAI && !draft.useClaude)} onClick={() => onSave(draft)}>
          Save settings
        </button>
      </div>

      <div className="provider-grid">
        {(["openai", "claude"] as Provider[]).map((provider) => {
          const field = provider === "openai" ? "useOpenAI" : "useClaude";
          const enabled = draft[field];
          return (
            <label className={`provider-toggle ${enabled ? "active" : ""}`} key={provider}>
              <span className="switch-copy">
                <strong>Use {providerName(provider)}</strong>
                <small>{payload.models[provider]}</small>
              </span>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.checked }))}
              />
              <span className="switch" aria-hidden="true" />
              <span className={`credential ${payload.credentials[provider] ? "ok" : "missing"}`}>
                {payload.credentials[provider] ? "Key ready" : "Key missing"}
              </span>
            </label>
          );
        })}
      </div>

      {!draft.useOpenAI && !draft.useClaude && <p className="inline-error">At least one provider must remain enabled.</p>}

      <label className="voice-provider-select">
        <span>Voice update model</span>
        <select
          value={draft.voiceUpdateProvider}
          onChange={(event) => setDraft((current) => ({ ...current, voiceUpdateProvider: event.target.value as Provider }))}
        >
          <option value="openai">OpenAI</option>
          <option value="claude">Claude</option>
        </select>
      </label>
      {(!voiceEnabled || !voiceCredential) && (
        <p className="inline-warning">
          Select an enabled provider with credentials before updating PJ Voice.
        </p>
      )}
      <p className="settings-note">
        Disabled providers are not called, do not need keys, and are excluded from new-batch statistics. Historical drafts stay intact.
      </p>
    </section>
  );
}

function StatCard({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}

function StatsStrip({ stats }: { stats: ComparisonStats }) {
  return (
    <section className="stats-strip" aria-label="Current batch comparison">
      <StatCard label="Reviewed" value={`${stats.reviewed}/${stats.total}`} />
      {stats.openai && (
        <StatCard
          label="OpenAI selected"
          value={stats.openai.selected}
          detail={`${stats.openai.soundsLikeMeRate}% sounds like me · ${stats.openai.averageEditPercent}% edited`}
        />
      )}
      {stats.claude && (
        <StatCard
          label="Claude selected"
          value={stats.claude.selected}
          detail={`${stats.claude.soundsLikeMeRate}% sounds like me · ${stats.claude.averageEditPercent}% edited`}
        />
      )}
      <StatCard label="Neither" value={stats.neitherSelected} />
      <StatCard label="Manual" value={stats.manualReplacements} />
    </section>
  );
}

const feedbackLabels: Record<FeedbackCategory, string> = {
  sounds_like_me: "Sounds like me",
  does_not_sound_like_me: "Does not sound like me",
  good_idea_wrong_wording: "Good idea, wrong wording",
  would_not_reply: "I would not reply to this",
};

function ReviewCard({ post, index, busy, onSaved }: { post: BatchPost; index: number; busy: boolean; onSaved: () => Promise<void> }) {
  const existing = post.review;
  const initialSource = existing?.selectedSource ?? ("" as SelectionSource);
  const [selectedSource, setSelectedSource] = useState<SelectionSource | "">(initialSource);
  const [editedReply, setEditedReply] = useState(existing?.editedReply ?? "");
  const [replacementReply, setReplacementReply] = useState(existing?.replacementReply ?? "");
  const [feedbackCategory, setFeedbackCategory] = useState<FeedbackCategory | "">(existing?.feedbackCategory ?? "");
  const [writtenFeedback, setWrittenFeedback] = useState(existing?.writtenFeedback ?? "");
  const [wouldReply, setWouldReply] = useState(existing?.wouldReply ?? true);
  const [saving, setSaving] = useState(false);
  const [cardError, setCardError] = useState("");

  function choose(source: SelectionSource) {
    setSelectedSource(source);
    if (source === "openai" || source === "claude") setEditedReply(post.drafts[source]?.content ?? "");
    if (source === "manual") setEditedReply(replacementReply);
    if (source === "neither") setEditedReply("");
  }

  async function save() {
    if (!selectedSource || !feedbackCategory) {
      setCardError("Choose a reply source and a feedback category.");
      return;
    }
    setSaving(true);
    setCardError("");
    try {
      await api<{ review: SavedReview }>("/api/reviews", {
        method: "POST",
        body: JSON.stringify({
          postId: post.id,
          selectedSource,
          editedReply,
          replacementReply,
          feedbackCategory,
          writtenFeedback,
          wouldReply,
        }),
      });
      await onSaved();
    } catch (error) {
      setCardError(error instanceof Error ? error.message : "Could not save review.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className={`review-card ${existing ? "reviewed" : ""}`}>
      <div className="post-column">
        <div className="post-meta">
          <span className="post-number">{String(index + 1).padStart(2, "0")}</span>
          <div>
            <strong>{post.authorName}</strong>
            <span>@{post.username} · {formatDate(post.createdAt)}</span>
          </div>
          <span className="topic-chip">{post.category === "ai_ml" ? "AI / ML" : "Software"}</span>
        </div>
        <p className="post-text">{post.text}</p>
        {post.media.map((media, mediaIndex) => {
          const source = media.url ?? media.previewUrl;
          return source ? <img className="post-media" src={source} alt={media.altText ?? "Post media"} key={mediaIndex} /> : null;
        })}
        <div className="metrics">
          <span>♥ {formatNumber(post.metrics.likes)}</span>
          <span>↻ {formatNumber(post.metrics.reposts)}</span>
          <span>↩ {formatNumber(post.metrics.replies)}</span>
          <span>◈ {formatNumber(post.metrics.quotes)}</span>
          {post.metrics.impressions !== undefined && <span>◉ {formatNumber(post.metrics.impressions)}</span>}
        </div>
        <a className="x-link" href={post.url} target="_blank" rel="noreferrer">Open original on X ↗</a>
      </div>

      <div className="review-column">
        <fieldset className="draft-options">
          <legend>Select the best starting point</legend>
          {(["openai", "claude"] as Provider[]).map((provider) => {
            const draft = post.drafts[provider];
            if (!draft) return null;
            return (
              <label className={`draft-option ${selectedSource === provider ? "selected" : ""}`} key={provider}>
                <span className={`model-mark ${provider}`}>{providerName(provider)}</span>
                <input type="radio" name={`source-${post.id}`} checked={selectedSource === provider} onChange={() => choose(provider)} />
                <p>{draft.content}</p>
              </label>
            );
          })}
          <div className="compact-options">
            <label className={selectedSource === "manual" ? "selected" : ""}>
              <input type="radio" name={`source-${post.id}`} checked={selectedSource === "manual"} onChange={() => choose("manual")} /> Manual
            </label>
            <label className={selectedSource === "neither" ? "selected" : ""}>
              <input type="radio" name={`source-${post.id}`} checked={selectedSource === "neither"} onChange={() => choose("neither")} /> Neither
            </label>
          </div>
        </fieldset>

        <label className="field">
          <span>Final reply <small>editable</small></span>
          <textarea rows={3} value={editedReply} onChange={(event) => setEditedReply(event.target.value)} placeholder="Select a draft, then edit it here." />
          <small className={editedReply.length > 280 ? "over-limit" : ""}>{editedReply.length}/280</small>
        </label>

        <div className="form-grid">
          <label className="field">
            <span>Feedback</span>
            <select
              value={feedbackCategory}
              onChange={(event) => {
                const value = event.target.value as FeedbackCategory;
                setFeedbackCategory(value);
                if (value === "would_not_reply") setWouldReply(false);
              }}
            >
              <option value="">Choose feedback…</option>
              {Object.entries(feedbackLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </label>
          <label className="reply-intent">
            <input type="checkbox" checked={wouldReply} onChange={(event) => setWouldReply(event.target.checked)} />
            I would reply
          </label>
        </div>

        <label className="field">
          <span>Paul’s replacement response</span>
          <textarea rows={2} value={replacementReply} onChange={(event) => setReplacementReply(event.target.value)} placeholder="Optional: write the response you would actually use." />
        </label>
        <label className="field">
          <span>Written feedback</span>
          <textarea rows={2} value={writtenFeedback} onChange={(event) => setWrittenFeedback(event.target.value)} placeholder="What should the voice system learn from this example?" />
        </label>
        {cardError && <p className="inline-error">{cardError}</p>}
        <button className="button save-review" disabled={busy || saving} onClick={save}>
          {saving ? "Saving…" : existing ? "Update review" : "Save review"}
        </button>
      </div>
    </article>
  );
}

function VoiceWorkspace({
  voice,
  busy,
  onSave,
  onRestore,
  onApprove,
}: {
  voice: VoicePayload;
  busy: boolean;
  onSave: (content: string) => Promise<void>;
  onRestore: (id: number) => Promise<void>;
  onApprove: () => Promise<void>;
}) {
  const [content, setContent] = useState(voice.content);
  useEffect(() => setContent(voice.content), [voice.content]);

  return (
    <section className="voice-workspace">
      <div className="section-heading">
        <div>
          <p className="eyebrow">PERSISTENT CONTEXT · VERSION {voice.version}</p>
          <h2>Current PJ voice</h2>
          <p>This file guides both providers. Saving or restoring archives the version it replaces.</p>
        </div>
        {voice.calibrationComplete && <span className="approved-badge">Approved voice</span>}
      </div>
      <textarea className="voice-editor" value={content} onChange={(event) => setContent(event.target.value)} spellCheck="false" />
      <div className="button-row">
        <button className="button" disabled={busy} onClick={() => onSave(content)}>Save manual edit</button>
        <button className="button approve" disabled={busy} onClick={onApprove}>I’m Satisfied With the Current Voice</button>
      </div>

      <div className="revision-list">
        <h3>Previous revisions</h3>
        {voice.revisions.length === 0 && <p className="empty-copy">No archived revisions yet. The first update or manual edit will preserve the current file here.</p>}
        {voice.revisions.map((revision) => (
          <div className="revision-row" key={revision.id}>
            <div>
              <strong>{revision.approved ? "Approved · " : ""}{revision.filename}</strong>
              <span>{formatDate(revision.createdAt)} · {revision.summary}</span>
            </div>
            <button className="text-button" disabled={busy} onClick={() => onRestore(revision.id)}>Restore</button>
          </div>
        ))}
      </div>
    </section>
  );
}

function HistoryView({ batches }: { batches: (Batch & { stats: ComparisonStats })[] }) {
  return (
    <section className="history-view">
      <div className="section-heading">
        <div>
          <p className="eyebrow">PRESERVED CALIBRATION DATA</p>
          <h2>Batch history</h2>
          <p>All drafts and feedback remain visible even when their provider is currently disabled.</p>
        </div>
      </div>
      {batches.length === 0 && <p className="empty-copy">No batches yet.</p>}
      {batches.map((batch) => (
        <details className="history-batch" key={batch.id}>
          <summary>
            <span>Batch {batch.id}</span>
            <span>{formatDate(batch.createdAt)}</span>
            <span>{batch.providers.map(providerName).join(" + ")}</span>
            <span>{batch.stats.reviewed}/{batch.stats.total} reviewed</span>
          </summary>
          <div className="history-posts">
            {batch.posts.map((post) => (
              <article className="history-post" key={post.id}>
                <p><strong>@{post.username}</strong> · {post.text}</p>
                {post.drafts.openai && <blockquote><b>OpenAI</b>{post.drafts.openai.content}</blockquote>}
                {post.drafts.claude && <blockquote><b>Claude</b>{post.drafts.claude.content}</blockquote>}
                {post.review ? (
                  <div className="history-feedback">
                    Selected: {post.review.selectedSource} · {feedbackLabels[post.review.feedbackCategory]}
                    {post.review.editedReply && <span>Final: {post.review.editedReply}</span>}
                    {post.review.replacementReply && <span>Replacement: {post.review.replacementReply}</span>}
                    {post.review.writtenFeedback && <span>Feedback: {post.review.writtenFeedback}</span>}
                  </div>
                ) : <span className="muted">Not reviewed</span>}
              </article>
            ))}
          </div>
        </details>
      ))}
    </section>
  );
}

export function XAgentDashboard() {
  const [tab, setTab] = useState<Tab>("review");
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [stats, setStats] = useState<ComparisonStats | null>(null);
  const [voice, setVoice] = useState<VoicePayload | null>(null);
  const [history, setHistory] = useState<(Batch & { stats: ComparisonStats })[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const loadCurrent = useCallback(async () => {
    const payload = await api<{ batch: Batch | null; stats: ComparisonStats }>("/api/batches/current");
    setBatch(payload.batch);
    setStats(payload.stats);
  }, []);

  const loadVoice = useCallback(async () => setVoice(await api<VoicePayload>("/api/voice")), []);
  const loadHistory = useCallback(async () => {
    const payload = await api<{ batches: (Batch & { stats: ComparisonStats })[] }>("/api/history");
    setHistory(payload.batches);
  }, []);

  useEffect(() => {
    Promise.all([api<SettingsPayload>("/api/settings"), api<VoicePayload>("/api/voice"), api<{ batch: Batch | null; stats: ComparisonStats }>("/api/batches/current")])
      .then(([settingsPayload, voicePayload, batchPayload]) => {
        setSettings(settingsPayload);
        setVoice(voicePayload);
        setBatch(batchPayload.batch);
        setStats(batchPayload.stats);
      })
      .catch((error) => setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not load X Agent." }));
  }, []);

  useEffect(() => {
    if (tab === "history") loadHistory().catch(() => undefined);
  }, [tab, loadHistory]);

  const reviewed = stats?.reviewed ?? 0;
  const fullyReviewed = Boolean(batch && stats && stats.total > 0 && reviewed === stats.total);
  const updateProviderAvailable = useMemo(() => {
    if (!settings) return false;
    const provider = settings.settings.voiceUpdateProvider;
    const enabled = provider === "openai" ? settings.settings.useOpenAI : settings.settings.useClaude;
    return enabled && settings.credentials[provider];
  }, [settings]);

  async function withBusy(action: () => Promise<void>) {
    setBusy(true);
    setNotice(null);
    try {
      await action();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "The request failed." });
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings(input: Pick<ProviderSettings, "useOpenAI" | "useClaude" | "voiceUpdateProvider">) {
    await withBusy(async () => {
      const payload = await api<SettingsPayload>("/api/settings", { method: "PUT", body: JSON.stringify(input) });
      setSettings(payload);
      setNotice({ kind: "success", text: "Provider settings saved locally. They will apply to the next generated batch." });
    });
  }

  async function generate() {
    await withBusy(async () => {
      const payload = await api<{ batch: Batch; stats: ComparisonStats }>("/api/batches/generate", { method: "POST" });
      setBatch(payload.batch);
      setStats(payload.stats);
      setNotice({ kind: "success", text: `Batch ${payload.batch.id} generated with ${payload.batch.providers.map(providerName).join(" and ")}.` });
      setTab("review");
    });
  }

  async function updateVoiceAndNext() {
    if (!batch) return;
    await withBusy(async () => {
      const payload = await api<{ voice: { changed: boolean; summary: string }; batch: Batch; stats: ComparisonStats }>("/api/voice/update-next", {
        method: "POST",
        body: JSON.stringify({ batchId: batch.id }),
      });
      setBatch(payload.batch);
      setStats(payload.stats);
      await Promise.all([loadVoice(), loadHistory()]);
      setNotice({ kind: "success", text: `PJ Voice ${payload.voice.changed ? "updated" : "kept unchanged"}: ${payload.voice.summary}` });
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  async function saveVoice(content: string) {
    await withBusy(async () => {
      const payload = await api<VoicePayload & { summary: string }>("/api/voice", { method: "PATCH", body: JSON.stringify({ content }) });
      setVoice((current) => current ? { ...current, ...payload } : payload);
      setNotice({ kind: "success", text: payload.summary });
    });
  }

  async function restoreVoice(id: number) {
    await withBusy(async () => {
      const payload = await api<VoicePayload & { summary: string }>(`/api/voice/restore/${id}`, { method: "POST" });
      setVoice((current) => current ? { ...current, ...payload } : payload);
      setNotice({ kind: "success", text: payload.summary });
    });
  }

  async function approveVoice() {
    await withBusy(async () => {
      const payload = await api<{ message: string }>("/api/voice/approve", { method: "POST" });
      await Promise.all([loadVoice(), api<SettingsPayload>("/api/settings").then(setSettings)]);
      setNotice({ kind: "success", text: payload.message });
    });
  }

  if (!settings || !voice || !stats) {
    return <main className="loading-screen"><div className="spinner" /><p>Opening X Agent…</p></main>;
  }

  return (
    <main className="shell">
      <header className="hero app-hero">
        <div>
          <p className="eyebrow">PAUL JIANG’S LOCAL CALIBRATION WORKSPACE</p>
          <h1>X Agent</h1>
          <p>Compare model drafts, teach a persistent public voice, and keep publishing out of the loop.</p>
        </div>
        <div className="hero-status">
          <span className={settings.settings.calibrationComplete ? "status-dot complete" : "status-dot"} />
          {settings.settings.calibrationComplete ? "Voice approved" : "Calibration active"}
        </div>
      </header>

      <nav className="tabs" aria-label="X Agent sections">
        {(["review", "voice", "history"] as Tab[]).map((item) => (
          <button className={tab === item ? "active" : ""} onClick={() => setTab(item)} key={item}>
            {item === "review" ? "Calibration" : item === "voice" ? "PJ Voice" : "History"}
          </button>
        ))}
      </nav>

      {notice && <div className={`notice ${notice.kind}`} role="status"><span>{notice.text}</span><button onClick={() => setNotice(null)}>×</button></div>}
      {busy && <div className="busy-bar"><span />Working… model calls can take a minute.</div>}

      {tab === "review" && (
        <>
          <ProviderSettingsPanel payload={settings} busy={busy} onSave={saveSettings} />
          {batch && <StatsStrip stats={stats} />}

          {!batch ? (
            <section className="empty-state">
              <span className="empty-index">01</span>
              <h2>Generate the first calibration batch</h2>
              <p>X Agent will rank 10 technical posts and call only the providers enabled above.</p>
              <button className="button primary large" disabled={busy} onClick={generate}>Generate first 10</button>
              {!settings.credentials.x && !settings.credentials.fixtures && <p className="inline-warning">Add X_BEARER_TOKEN, or set X_USE_FIXTURES=true for local fixture mode.</p>}
            </section>
          ) : (
            <section className="batch-section">
              <div className="section-heading batch-heading">
                <div>
                  <p className="eyebrow">BATCH {batch.id} · {batch.source === "fixtures" ? "LOCAL FIXTURES" : "OFFICIAL X API"}</p>
                  <h2>Review the current 10</h2>
                  <p>Generated with {batch.providers.map(providerName).join(" + ")} · voice version {batch.voiceVersion}</p>
                </div>
                <span className="review-progress">{reviewed} of {stats.total} reviewed</span>
              </div>
              <div className="review-list">
                {batch.posts.map((post, index) => <ReviewCard post={post} index={index} busy={busy} onSaved={loadCurrent} key={post.id} />)}
              </div>
              <div className="batch-actions">
                <div>
                  <h3>{fullyReviewed ? "Batch complete" : `${stats.total - reviewed} reviews remaining`}</h3>
                  <p>The voice updater uses only this completed batch plus the persistent profile—not the entire feedback database.</p>
                </div>
                <button className="button primary large" disabled={busy || !fullyReviewed || !updateProviderAvailable} onClick={updateVoiceAndNext}>
                  Update PJ Voice and Generate Next 10
                </button>
                {fullyReviewed && !updateProviderAvailable && <p className="inline-warning">Choose an enabled, credentialed voice-update provider above.</p>}
              </div>
            </section>
          )}
        </>
      )}

      {tab === "voice" && <VoiceWorkspace voice={voice} busy={busy} onSave={saveVoice} onRestore={restoreVoice} onApprove={approveVoice} />}
      {tab === "history" && <HistoryView batches={history} />}
    </main>
  );
}
