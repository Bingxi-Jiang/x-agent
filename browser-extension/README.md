# X Agent — For You Capture

This unpacked Chrome/Edge extension captures posts that X has actually rendered in the logged-in account's **For You** tab. It does not read or store the account password, call X's private APIs, or publish replies.

## Install

1. Start X Agent (`pnpm dev`).
2. Open `chrome://extensions` (or `edge://extensions`) and turn on **Developer mode**.
3. Choose **Load unpacked** and select this `browser-extension` directory. If the repository is in a remote Codespace, download this directory to your computer first.
4. Open the extension's **Details → Extension options**. Keep `http://localhost:3000` for a local server, or enter the forwarded HTTPS URL for a Codespace.
5. If `X_AGENT_IMPORT_TOKEN` is set in X Agent, enter the same value in the extension options.

## Capture

1. Open [x.com/home](https://x.com/home) and select **For You**.
2. Browse or scroll the feed. The bottom-right capture panel counts posts as X renders them.
3. Select **Send posts to X Agent**. For a private Codespace, the extension opens an X Agent tab so GitHub can authenticate the import normally.
4. Return to X Agent, refresh the feed status, and generate the batch.

X Agent chooses the first 10 unseen, substantive technical posts in captured **For You** order. Browse farther and capture again when fewer than 10 eligible unseen posts are available.
