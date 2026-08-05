const DEFAULT_AGENT_URL = "http://localhost:3000";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "send-for-you-posts") return false;

  chrome.storage.local.get({ agentUrl: DEFAULT_AGENT_URL, importToken: "" }, async (settings) => {
    try {
      const agentUrl = String(settings.agentUrl || DEFAULT_AGENT_URL).replace(/\/+$/, "");
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
        error: error instanceof Error ? error.message : "Could not reach X Agent.",
      });
    }
  });

  return true;
});
