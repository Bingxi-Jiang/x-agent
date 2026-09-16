# X Agent

X Agent is a local, personal writing agent that learns how you prefer to reply on X.
Its browser extension captures posts already shown in your **For You** feed, the app
generates draft replies with OpenAI and/or Claude, and your edits and ratings refine a
persistent voice profile.

The repository ships with neutral profile templates and no API keys or personal
writing samples. Fork it, add your own public identity facts and style preferences,
and calibrate it with your own feedback.

> X Agent is an experimental personal project. It does not publish posts, schedule
> activity, fine-tune model weights, or operate an X account unattended. You review
> every draft and publish manually.

## How it works

1. The browser extension captures posts rendered in your X **For You** tab.
2. X Agent selects 10 unseen, substantive posts in feed order.
3. Enabled model providers generate reply drafts using your local profiles.
4. You choose, edit, reject, and rate the drafts.
5. After a completed batch, a selected provider can update the voice profile when the
   feedback shows a meaningful pattern.
6. Previous profile revisions are archived locally and can be restored.

Only a small set of relevant reviewed examples is retrieved for each new draft. The
app does not send the entire feedback database on every request.

## Requirements

- Node.js 22.13 or newer (Node 24 is supported)
- pnpm 10 or newer
- Chrome or Edge for the unpacked capture extension, or local fixture mode
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

Only enabled providers need credentials. Model names can be changed to models
available to your accounts. Never put real credentials in source files; all `.env*`
files except `.env.example` are ignored by Git.

`X_AGENT_IMPORT_TOKEN` protects the capture endpoint. It is optional on localhost but
should be set to a unique secret whenever the app is exposed through a forwarded or
public URL. Enter the same value in the extension options.

## Personalize the agent

Edit these starter files before calibrating:

- `data/identity-profile.md`: public facts, areas of knowledge, audience, interests,
  and factual boundaries. Add only details you are comfortable using in public posts.
- `data/voice-profile.md`: tone, phrasing, reasoning preferences, rejected habits,
  topic preferences, and representative public examples.

Ordinary feedback can revise the voice profile but never rewrites the stable identity
profile. Both included files are generic templates; they contain no maintainer persona
or private writing samples.

## Install the capture extension

1. Start X Agent so the capture endpoint is available.
2. Open `chrome://extensions` or `edge://extensions` and enable **Developer mode**.
3. Select **Load unpacked** and choose the `browser-extension` directory.
4. Open the extension options. Keep `http://localhost:3000` for local use, or enter
   your forwarded HTTPS URL. Add the import token if one is configured.
5. Visit [x.com/home](https://x.com/home), select **For You**, and browse or scroll.
6. Use **Send posts to X Agent**, return to the app, and refresh the capture status.

The extension reads only posts X renders while **For You** is selected. It stores no X
password or session cookie, calls no private X endpoint, and never publishes a reply.

## Run locally

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), save provider settings, and
generate the first batch. For UI development without a captured feed, set
`X_USE_FIXTURES=true`; fixture mode still needs keys for enabled model providers.

The SQLite database is created at `data/x-agent.db` by default. It contains captured
posts, drafts, edits, ratings, settings, and revision metadata and is ignored by Git.
Use `DATABASE_PATH` to store it elsewhere.

## Provider controls

X Agent supports OpenAI only, Claude only, or both. The voice-update provider is
selected independently. Disabled providers are not called and incur no model usage;
their existing drafts and reviews remain visible in History.

## Validation

```bash
pnpm test
pnpm typecheck
pnpm build
```

The tests use mocked model calls and do not access a live X session or call provider
APIs.

## Privacy and security

Captured feeds, generated databases, voice revisions, and environment files should
stay local. See [SECURITY.md](SECURITY.md) before exposing the app to a network. If a
credential has ever been committed, revoke it immediately even after removing it from
Git history.

## License

[MIT](LICENSE)
