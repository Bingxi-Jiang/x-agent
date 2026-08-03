# X Agent

X Agent is a local voice-calibration app for teaching AI models to draft technical X replies in Paul Jiang’s public writing style. It retrieves and ranks 10 recent computer-science posts, generates drafts with the enabled model providers, captures Paul’s edits and feedback, and revises a persistent PJ voice profile.

It does not publish to X, fine-tune model weights, schedule activity, or operate an X account unattended.

## Calibration workflow

1. Choose `Use OpenAI`, `Use Claude`, or both. At least one must remain enabled.
2. Choose OpenAI or Claude as the voice-update model and save the settings.
3. Generate a batch of 10 posts. X Agent aims for five software-engineering and five AI/ML posts and strongly deprioritizes QA/test-automation content.
4. For each post, select an available model draft, select neither, or write a manual response. Edit the final reply, rate it, and add optional replacement wording and written feedback.
5. After all 10 reviews are saved, select `Update PJ Voice and Generate Next 10`.
6. Read the concise update summary. The model changes `data/pj-voice.md` only when the batch demonstrates a meaningful pattern; the prior version is archived.
7. Manually edit the current voice or restore any archived revision from the PJ Voice tab when needed.
8. Select `I’m Satisfied With the Current Voice` to preserve an approved revision and mark calibration complete. This never publishes anything.

Voice learning uses persistent instructions and a small retrieved set of relevant reviewed examples. It never sends the entire feedback database with every generation and never claims to train provider model weights.

## Requirements

- Node.js 22.13 or newer (Node 24 is supported)
- pnpm 10 or newer
- Official X API access for live recent search, or local fixture mode
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
X_BEARER_TOKEN=
X_USE_FIXTURES=false

OPENAI_API_KEY=
OPENAI_MODEL=gpt-5-mini
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-5

DATABASE_PATH=
```

Credentials and permissions:

- `X_BEARER_TOKEN`: create a project/app in the [X Developer Portal](https://developer.x.com/). The app needs read-only access and an API tier that permits the v2 recent-search endpoint (`GET /2/tweets/search/recent`). No X write permission is requested.
- `OPENAI_API_KEY`: create a key in the [OpenAI API platform](https://platform.openai.com/api-keys). It is required only when OpenAI generation or OpenAI voice updating is selected.
- `ANTHROPIC_API_KEY`: create a key in the [Claude API Console](https://platform.claude.com/settings/keys). It is required only when Claude generation or Claude voice updating is selected.
- Model names are configurable. Set each name to a model available to that account.

Never place real credentials in source files. `.env` and `.env.local` are ignored by Git.

For UI development without X credentials, set `X_USE_FIXTURES=true`. Fixture mode supplies 30 clearly marked, local technical posts; model generation still requires keys for the enabled providers. Fixtures are not presented as live X results.

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

## Official X API behavior and limitations

Live mode queries the [official v2 recent-search endpoint](https://docs.x.com/x-api/posts/search/quickstart/recent-search) twice—once for software-engineering candidates and once for AI/ML candidates—then ranks the combined candidate set using topic relevance, engagement, recency, and substance. Reposts, obvious promotions, unrelated politics, duplicates, low-substance text, and previously stored posts are excluded.

Recent search generally covers approximately the last seven days. Availability, rate limits, metrics, media fields, and impression counts depend on the X project’s current API tier and what X exposes for a post. If the project tier does not permit recent search, X Agent returns the API’s status/detail; it does not fall back to scraping.

## Validation

```bash
pnpm test
pnpm typecheck
pnpm build
```

Focused tests cover:

- provider settings persistence and the at-least-one-provider invariant;
- 50/50 SWE–AI ranking;
- OpenAI-only, Claude-only, and dual-provider call/storage behavior using mocked model calls;
- preservation of disabled-provider drafts, feedback, and original-batch statistics.

The production build and local page/settings/batch/voice API smoke tests run without credentials. Live X, OpenAI, and Anthropic requests require the corresponding credentials and were not asserted by the credential-free test suite.
