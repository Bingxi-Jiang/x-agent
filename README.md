# X Agent

X Agent is a local voice-calibration app for teaching AI models to draft technical X replies in Paul Jiang’s public writing style. Its browser extension captures posts that are actually shown in Paul's personalized X **For You** tab; the app keeps their feed order, chooses 10 unseen substantive technical posts, generates drafts with the enabled model providers, captures Paul’s edits and feedback, and revises a persistent PJ voice profile.

It does not publish to X, fine-tune model weights, schedule activity, or operate an X account unattended.

## Calibration workflow

1. Choose `Use OpenAI`, `Use Claude`, or both. At least one must remain enabled.
2. Choose OpenAI or Claude as the voice-update model and save the settings.
3. Open X’s **For You** tab with the capture extension installed, browse or scroll the feed, and send the captured posts to X Agent.
4. Generate a batch of 10 posts. X Agent uses the first 10 eligible posts in captured For You order and strongly deprioritizes QA/test-automation content.
5. For each post, select an available model draft, select neither, or write a manual response. Edit the final reply, rate it, and add optional replacement wording and written feedback. Use `Reply on X with this draft` to open X's reply composer with the text prefilled; publishing remains a manual action.
6. After all 10 reviews are saved, select `Update PJ Voice and Generate Next 10`.
7. Read the concise update summary. The model changes `data/pj-voice.md` only when the batch demonstrates a meaningful pattern; the prior version is archived.
8. Manually edit the current voice or restore any archived revision from the PJ Voice tab when needed.
9. Select `I’m Satisfied With the Current Voice` to preserve an approved revision and mark calibration complete. This never publishes anything automatically.

Voice learning uses persistent instructions and a small retrieved set of relevant reviewed examples. It never sends the entire feedback database with every generation and never claims to train provider model weights.

## Requirements

- Node.js 22.13 or newer (Node 24 is supported)
- pnpm 10 or newer
- Chrome or Edge for the unpacked For You capture extension, or local fixture mode
- An API key for each enabled model provider

Install pnpm if needed:

```bash
npm install --global pnpm
```

## Setup

```bash
git clone https://github.com/Bingxi-Jiang/x-agent.git
cd x-agent
pnpm install
cp .env.example .env.local
```

Configure `.env.local`:

```env
X_USE_FIXTURES=false
X_AGENT_IMPORT_TOKEN=

OPENAI_API_KEY=
OPENAI_MODEL=gpt-5-mini
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-5

DATABASE_PATH=
```

Credentials and permissions:

- `X_AGENT_IMPORT_TOKEN`: shared secret protecting the capture endpoint. It is optional on localhost and recommended for any forwarded or public URL. When set, enter the same value in the extension options; the extension stores it only in local browser storage.
- `OPENAI_API_KEY`: create a key in the [OpenAI API platform](https://platform.openai.com/api-keys). It is required only when OpenAI generation or OpenAI voice updating is selected.
- `ANTHROPIC_API_KEY`: create a key in the [Claude API Console](https://platform.claude.com/settings/keys). It is required only when Claude generation or Claude voice updating is selected.
- Model names are configurable. Set each name to a model available to that account.

Never place real credentials in source files. `.env` and `.env.local` are ignored by Git.

For UI development without a captured feed, set `X_USE_FIXTURES=true`. Fixture mode supplies 30 clearly marked, local technical posts; model generation still requires keys for the enabled providers. Fixtures are not presented as live X results.

## Install the For You capture extension

1. Start X Agent so the capture endpoint is available.
2. Open `chrome://extensions` (or `edge://extensions`) and enable **Developer mode**.
3. Select **Load unpacked** and choose the [`browser-extension`](browser-extension) directory. If the repository is in a remote Codespace, download that directory to your computer first.
4. Open the extension's **Details → Extension options**. Keep `http://localhost:3000` when running locally, or enter the forwarded HTTPS URL when running in a Codespace. If `X_AGENT_IMPORT_TOKEN` is configured, enter the same token here.
5. Visit [x.com/home](https://x.com/home), select **For You**, and browse or scroll. The bottom-right panel counts rendered posts. Select **Send posts to X Agent**, return to the app, and refresh the capture status.

The extension sees only posts X renders while the **For You** tab is selected. It stores no X password or session cookie, calls no private X endpoint, and never publishes a reply.

If an older keyword-search batch is still open, capture For You and select **Replace current batch with For You**. The unwanted batch is removed from the active workflow without contributing feedback to the voice profile.

## Run locally

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). On the Calibration tab, save provider settings and select `Generate first 10`.

The SQLite database is initialized automatically on first server access at `data/x-agent.db`. Set `DATABASE_PATH` to use another local path. No migration command is required.

## Provider controls

The supported generation modes are:

- OpenAI and Claude
- OpenAI only
- Claude only

Settings are stored in SQLite and remain active after restarts. For every new batch, X Agent snapshots the enabled providers. A disabled provider is not called, gets no placeholder draft, requires no key, incurs no model usage, and is excluded from that batch’s comparison statistics. Its existing drafts and reviews remain visible in History.

The voice updater is selected independently. If its provider is disabled or missing a key, X Agent blocks the update and asks Paul to choose an enabled, credentialed provider.

## Persistent learning data

- `data/paul-profile.md`: stable identity, experience, audience, and factual boundaries. Ordinary feedback never rewrites it automatically.
- `data/pj-voice.md`: current shared writing instructions used by both providers.
- `data/x-agent.db`: batches, source posts, provider drafts, selections, edits, replacements, no-reply decisions, ratings, written feedback, settings, statistics, and revision metadata.
- `data/voice-revisions/`: archived and approved voice-profile versions.

The History tab retains source posts and both providers’ historical drafts even after a provider is disabled. The PJ Voice tab supports manual edits, restores, and approval.

## Why capture happens in the browser

X's official API exposes a reverse-chronological home timeline from followed accounts, but its documentation says that endpoint excludes algorithmic ranking. It does not return the same account-specific **For You** feed shown in the X app. X Agent therefore captures the posts already rendered in the logged-in browser rather than substituting keyword search or the Following timeline.

Capture is intentionally user-initiated. X Agent preserves captured feed order, then excludes previously reviewed posts, obvious promotions, unrelated politics, duplicates, low-substance text, and nontechnical posts. If fewer than 10 eligible unseen posts remain, browse farther in For You and capture again.

## Validation

```bash
pnpm test
pnpm typecheck
pnpm build
```

Focused tests cover:

- provider settings persistence and the at-least-one-provider invariant;
- 50/50 SWE–AI fixture ranking and For You feed-order selection;
- OpenAI-only, Claude-only, and dual-provider call/storage behavior using mocked model calls;
- preservation of disabled-provider drafts, feedback, and original-batch statistics.

The production build and local page/settings/batch/voice API smoke tests run without credentials. The test suite does not access a live X session or call the OpenAI and Anthropic APIs.
