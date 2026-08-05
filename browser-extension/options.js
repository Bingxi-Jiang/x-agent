const agentUrl = document.querySelector("#agent-url");
const importToken = document.querySelector("#import-token");
const status = document.querySelector("#status");

chrome.storage.local.get({ agentUrl: "http://localhost:3000", importToken: "" }, (settings) => {
  agentUrl.value = settings.agentUrl;
  importToken.value = settings.importToken;
});

document.querySelector("#save").addEventListener("click", () => {
  const normalizedUrl = agentUrl.value.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    status.textContent = "Enter a complete http:// or https:// URL.";
    return;
  }
  chrome.storage.local.set({ agentUrl: normalizedUrl, importToken: importToken.value.trim() }, () => {
    status.textContent = "Saved.";
    setTimeout(() => { status.textContent = ""; }, 2_000);
  });
});
