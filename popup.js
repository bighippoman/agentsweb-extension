const CACHE_URL = "https://agentsweb.org";

let extractedData = null;

// On popup open, extract content from the active tab
document.addEventListener("DOMContentLoaded", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id || !tab.url?.startsWith("http")) {
    document.getElementById("pageUrl").textContent = "Not a web page";
    document.getElementById("cacheBtn").textContent = "Can't cache this";
    return;
  }

  document.getElementById("pageUrl").textContent = tab.url.slice(0, 60) + (tab.url.length > 60 ? "..." : "");

  try {
    // Inject extraction script and run it — no persistent content script needed
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["extract.js"],
    });

    // Run the extraction function
    const [extractResult] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => extractPageContent(),
    });

    const response = extractResult?.result;

    if (response && response.markdown) {
      extractedData = response;
      const tokens = Math.ceil(response.charCount / 4);

      document.getElementById("chars").textContent = response.charCount.toLocaleString();
      document.getElementById("words").textContent = response.wordCount.toLocaleString();
      document.getElementById("tokens").textContent = tokens.toLocaleString();

      const btn = document.getElementById("cacheBtn");
      btn.textContent = "Cache for AI agents";
      btn.disabled = false;
    } else {
      document.getElementById("status").textContent = "Could not extract content";
      document.getElementById("status").className = "status err";
      document.getElementById("cacheBtn").textContent = "No content found";
    }
  } catch (e) {
    document.getElementById("status").textContent = "Extraction error: " + e.message;
    document.getElementById("status").className = "status err";
    document.getElementById("cacheBtn").textContent = "Error";
  }
});

// Cache button click
document.getElementById("cacheBtn").addEventListener("click", async () => {
  if (!extractedData) return;

  const btn = document.getElementById("cacheBtn");
  const status = document.getElementById("status");

  btn.disabled = true;
  btn.textContent = "Caching...";
  status.textContent = "Sending to agentsweb.org...";
  status.className = "status working";

  try {
    const resp = await fetch(CACHE_URL + "/", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: extractedData.url,
        markdown: extractedData.markdown,
        source: "chrome-extension",
      }),
    });

    const data = await resp.json();

    if (data.status === "accepted" || data.status === "confirmed" || data.status === "duplicate") {
      status.textContent = "Cached! trust:" + (data.trust_level || 1) + " — available to all AI agents";
      status.className = "status ok";
      btn.textContent = "Cached";
    } else {
      status.textContent = data.error || data.reason || "Unknown error";
      status.className = "status err";
      btn.textContent = "Try again";
      btn.disabled = false;
    }
  } catch (e) {
    status.textContent = "Network error: " + e.message;
    status.className = "status err";
    btn.textContent = "Try again";
    btn.disabled = false;
  }
});
