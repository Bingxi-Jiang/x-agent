const DEFAULT_AGENT_URL = "http://localhost:3000";

function isCodespaceUrl(value) {
  try {
    return new URL(value).hostname.endsWith(".app.github.dev");
  } catch {
    return false;
  }
}

async function openAuthenticatedHandoff(agentUrl, payload) {
  await chrome.storage.local.set({ pendingForYouImport: payload });
  await chrome.tabs.create({ url: `${agentUrl}/for-you-import` });
}

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "send-for-you-posts") return false;

  chrome.storage.local.get({ agentUrl: DEFAULT_AGENT_URL, importToken: "" }, async (settings) => {
    const agentUrl = String(settings.agentUrl || DEFAULT_AGENT_URL).replace(/\/+$/, "");
    try {
      if (isCodespaceUrl(agentUrl)) {
        await openAuthenticatedHandoff(agentUrl, message.payload);
        sendResponse({ ok: true, handoff: true });
        return;
      }
      const headers = { "Content-Type": "application/json" };
      if (settings.importToken) headers["X-X-Agent-Token"] = String(settings.importToken);
      const response = await fetch(`${agentUrl}/api/for-you`, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify(message.payload),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `X Agent returned ${response.status}.`);
      sendResponse({ ok: true, status: payload });
    } catch (error) {
      sendResponse({
        ok: false,
        error: `Could not reach ${agentUrl}. Start X Agent and verify the URL in the extension options. ${error instanceof Error ? error.message : ""}`.trim(),
      });
    }
  });

  return true;
});
