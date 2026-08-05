import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

process.env.DATABASE_PATH = `/tmp/x-agent-for-you-route-${randomUUID()}.db`;
delete process.env.X_AGENT_IMPORT_TOKEN;

const payload = {
  capturedAt: "2026-08-05T12:00:00.000Z",
  posts: [{
    id: "1234567890123456789",
    authorName: "Proxy Test",
    username: "proxy_test",
    text: "A database architecture needs an explicit consistency model before cache invalidation can be reasoned about safely.",
    createdAt: "2026-08-05T11:00:00.000Z",
    metrics: { likes: 12, reposts: 2, replies: 1, quotes: 0 },
    url: "https://x.com/proxy_test/status/1234567890123456789",
    media: [],
  }],
};

test("For You import accepts its same-origin page through a forwarding proxy", async () => {
  const { POST } = await import("@/app/api/for-you/route");
  const response = await POST(new Request("http://localhost:3000/api/for-you", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://example-codespace-3000.app.github.dev",
      "X-Forwarded-Host": "example-codespace-3000.app.github.dev",
      "X-Forwarded-Proto": "https",
      "Sec-Fetch-Site": "same-origin",
    },
    body: JSON.stringify(payload),
  }));

  assert.equal(response.status, 201);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://example-codespace-3000.app.github.dev");
});

test("For You import rejects an unrelated browser origin", async () => {
  const { POST } = await import("@/app/api/for-you/route");
  const response = await POST(new Request("http://localhost:3000/api/for-you", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://malicious.example",
      "X-Forwarded-Host": "example-codespace-3000.app.github.dev",
      "X-Forwarded-Proto": "https",
      "Sec-Fetch-Site": "cross-site",
    },
    body: JSON.stringify(payload),
  }));

  assert.equal(response.status, 403);
});
