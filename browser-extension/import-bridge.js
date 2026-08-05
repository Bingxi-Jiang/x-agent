(() => {
  async function deliverPendingImport() {
    const settings = await chrome.storage.local.get({
      agentUrl: "http://localhost:3000",
      importToken: "",
      pendingForYouImport: null,
    });
    let configuredOrigin;
    try {
      configuredOrigin = new URL(settings.agentUrl).origin;
    } catch {
      return;
    }
    if (configuredOrigin !== location.origin || !settings.pendingForYouImport) return;
    window.postMessage({
      source: "x-agent-extension",
      type: "x-agent-for-you-import",
      payload: settings.pendingForYouImport,
      importToken: settings.importToken,
    }, location.origin);
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== location.origin || event.data?.source !== "x-agent-app") return;
    if (event.data.type === "x-agent-import-ready") deliverPendingImport();
    if (event.data.type === "x-agent-import-complete") chrome.storage.local.remove("pendingForYouImport");
  });

  deliverPendingImport();
})();
