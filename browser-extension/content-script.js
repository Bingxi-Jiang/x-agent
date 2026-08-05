(() => {
  if (window.top !== window || document.querySelector("x-agent-capture")) return;

  const captured = new Map();
  const host = document.createElement("x-agent-capture");
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .panel {
        position: fixed; z-index: 2147483647; right: 18px; bottom: 18px;
        width: 250px; padding: 13px; border: 1px solid #536471; border-radius: 13px;
        background: #0f1419; box-shadow: 0 8px 30px rgba(0,0,0,.32);
        color: #e7e9ea; font: 13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      }
      strong { display: block; margin-bottom: 3px; font-size: 14px; }
      p { margin: 0 0 10px; color: #8b98a5; }
      button {
        width: 100%; padding: 9px 10px; border: 0; border-radius: 999px;
        background: #1d9bf0; color: white; cursor: pointer; font: inherit; font-weight: 700;
      }
      button:disabled { cursor: wait; opacity: .65; }
      .status { min-height: 18px; margin: 8px 2px 0; color: #8b98a5; font-size: 11px; }
      .status.error { color: #f4212e; }
      .status.ok { color: #00ba7c; }
    </style>
    <div class="panel">
      <strong>X Agent · For You</strong>
      <p>Browse or scroll this feed. Visible posts are collected locally.</p>
      <button type="button">Send 0 posts to X Agent</button>
      <div class="status" role="status">Select the For You tab to begin.</div>
    </div>
  `;
  document.documentElement.appendChild(host);

  const button = shadow.querySelector("button");
  const status = shadow.querySelector(".status");

  function selectedForYouTab() {
    return [...document.querySelectorAll('[role="tab"]')].some((tab) =>
      tab.getAttribute("aria-selected") === "true" && tab.textContent?.trim().toLowerCase() === "for you"
    );
  }

  function compactNumber(value) {
    const match = String(value || "").replaceAll(",", "").match(/(\d+(?:\.\d+)?)\s*([KMB])?/i);
    if (!match) return 0;
    const multiplier = { K: 1_000, M: 1_000_000, B: 1_000_000_000 }[match[2]?.toUpperCase()] || 1;
    return Math.round(Number(match[1]) * multiplier);
  }

  function metric(article, testId) {
    const element = article.querySelector(`[data-testid="${testId}"]`);
    if (!element) return 0;
    return compactNumber(element.textContent || element.getAttribute("aria-label") || element.closest("button")?.getAttribute("aria-label"));
  }

  function parsePost(article) {
    if (/(^|\n)Promoted($|\n)/i.test(article.innerText)) return null;
    const textElement = article.querySelector('[data-testid="tweetText"]');
    const time = article.querySelector("time[datetime]");
    const statusLink = time?.closest("a[href*='/status/']");
    if (!textElement || !time || !statusLink) return null;

    const absoluteUrl = new URL(statusLink.getAttribute("href"), location.origin).href;
    const match = new URL(absoluteUrl).pathname.match(/^\/([^/]+)\/status\/(\d+)/);
    if (!match) return null;
    const [, username, id] = match;

    const userNameBlock = article.querySelector('[data-testid="User-Name"]');
    const authorName = (userNameBlock?.innerText || username)
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith("@") && line !== "·") || username;

    const media = [];
    const mediaUrls = new Set();
    for (const image of article.querySelectorAll('[data-testid="tweetPhoto"] img[src]')) {
      if (mediaUrls.has(image.src)) continue;
      mediaUrls.add(image.src);
      media.push({ type: "photo", url: image.src, altText: image.alt || undefined });
    }
    for (const video of article.querySelectorAll("video[poster]")) {
      if (mediaUrls.has(video.poster)) continue;
      mediaUrls.add(video.poster);
      media.push({ type: "video", previewUrl: video.poster });
    }

    return {
      id,
      authorName,
      username,
      text: textElement.innerText.trim(),
      createdAt: new Date(time.getAttribute("datetime")).toISOString(),
      metrics: {
        likes: metric(article, "like"),
        reposts: metric(article, "retweet"),
        replies: metric(article, "reply"),
        quotes: 0,
      },
      url: absoluteUrl,
      media,
    };
  }

  function updatePanel(message, kind = "") {
    button.textContent = `Send ${captured.size} post${captured.size === 1 ? "" : "s"} to X Agent`;
    status.textContent = message;
    status.className = `status ${kind}`;
  }

  function scan() {
    if (!selectedForYouTab()) {
      updatePanel(captured.size ? `${captured.size} For You posts ready to send.` : "Select the For You tab to begin.");
      return;
    }
    for (const article of document.querySelectorAll('article[data-testid="tweet"]')) {
      try {
        const post = parsePost(article);
        if (post && !captured.has(post.id)) captured.set(post.id, post);
      } catch {
        // X continuously replaces timeline nodes; an incomplete node is picked up on the next scan.
      }
    }
    updatePanel(`${captured.size} For You posts captured in feed order.`);
  }

  let scanScheduled = false;
  const observer = new MutationObserver(() => {
    if (scanScheduled) return;
    scanScheduled = true;
    requestAnimationFrame(() => {
      scanScheduled = false;
      scan();
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
  scan();

  button.addEventListener("click", () => {
    if (!selectedForYouTab()) {
      updatePanel("Select the For You tab before sending posts.", "error");
      return;
    }
    if (captured.size === 0) {
      updatePanel("No complete posts are visible yet. Scroll the feed and try again.", "error");
      return;
    }
    button.disabled = true;
    updatePanel("Sending captured posts…");
    chrome.runtime.sendMessage({
      type: "send-for-you-posts",
      payload: { capturedAt: new Date().toISOString(), posts: [...captured.values()] },
    }, (response) => {
      button.disabled = false;
      if (chrome.runtime.lastError) {
        updatePanel(chrome.runtime.lastError.message, "error");
      } else if (!response?.ok) {
        updatePanel(response?.error || "Could not reach X Agent.", "error");
      } else {
        updatePanel(`${response.status.postCount} For You posts sent. You can return to X Agent.`, "ok");
      }
    });
  });
})();
