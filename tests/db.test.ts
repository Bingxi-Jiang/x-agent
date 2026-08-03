import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

process.env.DATABASE_PATH = `/tmp/x-agent-db-${randomUUID()}.db`;

test("provider settings persist and reject disabling both providers", async () => {
  const { getSettings, saveSettings } = await import("@/lib/db");

  assert.deepEqual(
    { openai: getSettings().useOpenAI, claude: getSettings().useClaude },
    { openai: true, claude: true },
  );

  saveSettings({ useOpenAI: true, useClaude: false, voiceUpdateProvider: "openai" });
  assert.equal(getSettings().useClaude, false);
  assert.throws(
    () => saveSettings({ useOpenAI: false, useClaude: false, voiceUpdateProvider: "openai" }),
    /At least one reply provider/,
  );
});
