"use client";

import { useEffect, useState } from "react";

type ImportState =
  | { kind: "waiting"; message: string }
  | { kind: "working"; message: string }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

interface ExtensionImportMessage {
  source: "x-agent-extension";
  type: "x-agent-for-you-import";
  payload: unknown;
  importToken?: string;
}

export default function ForYouImportPage() {
  const [state, setState] = useState<ImportState>({
    kind: "waiting",
    message: "Waiting for the X Agent Capture extension…",
  });

  useEffect(() => {
    let importing = false;
    const receiveImport = async (event: MessageEvent<ExtensionImportMessage>) => {
      if (
        importing ||
        event.source !== window ||
        event.origin !== window.location.origin ||
        event.data?.source !== "x-agent-extension" ||
        event.data.type !== "x-agent-for-you-import"
      ) return;

      importing = true;
      setState({ kind: "working", message: "Importing the captured For You posts…" });
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (event.data.importToken) headers["X-X-Agent-Token"] = event.data.importToken;
        const response = await fetch("/api/for-you", {
          method: "POST",
          headers,
          body: JSON.stringify(event.data.payload),
        });
        const result = await response.json() as { postCount?: number; error?: string };
        if (!response.ok) throw new Error(result.error || `Import failed (${response.status}).`);
        window.postMessage({ source: "x-agent-app", type: "x-agent-import-complete" }, window.location.origin);
        setState({ kind: "success", message: `${result.postCount ?? 0} For You posts imported successfully.` });
      } catch (error) {
        setState({ kind: "error", message: error instanceof Error ? error.message : "Could not import the captured posts." });
      }
    };

    window.addEventListener("message", receiveImport);
    window.postMessage({ source: "x-agent-app", type: "x-agent-import-ready" }, window.location.origin);
    const retry = window.setInterval(() => {
      window.postMessage({ source: "x-agent-app", type: "x-agent-import-ready" }, window.location.origin);
    }, 1_000);
    return () => {
      window.removeEventListener("message", receiveImport);
      window.clearInterval(retry);
    };
  }, []);

  return (
    <main className="import-screen">
      <section className="import-card">
        <p className="eyebrow">X FOR YOU FEED</p>
        <h1>Secure capture handoff</h1>
        <p className={`import-message ${state.kind}`} role="status">{state.message}</p>
        {state.kind === "waiting" && <p className="import-help">Keep this tab open. If nothing happens, reload the X Agent Capture extension and send the feed again.</p>}
        {state.kind === "error" && <p className="import-help">Check that the extension URL and optional import token match this X Agent instance, then send the feed again.</p>}
        {state.kind === "success" && <a className="button primary large" href="/">Open X Agent</a>}
      </section>
    </main>
  );
}
