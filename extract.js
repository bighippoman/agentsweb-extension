/**
 * Content script — extracts article content from the current page.
 * Runs in the page context, has access to the fully rendered DOM.
 * Only activates when the user clicks the extension — no automatic collection.
 */

// Called directly via chrome.scripting.executeScript — no message passing needed

function extractPageContent() {
  const url = window.location.href;

  // Try to find the main content area
  const article = document.querySelector("article")
    || document.querySelector("main")
    || document.querySelector('[role="main"]')
    || document.querySelector(".post-content, .article-content, .entry-content, .markdown-body, .prose, .content")
    || document.body;

  // Clone to avoid modifying the actual page
  const clone = article.cloneNode(true);

  // Remove noise elements
  const noiseSelectors = [
    "nav", "header", "footer", "aside", "script", "style", "noscript",
    "svg", "button", "form", "iframe", "select", "textarea", "input",
    "[class*='sidebar']", "[class*='widget']", "[class*='banner']",
    "[class*='popup']", "[class*='modal']", "[class*='overlay']",
    "[class*='cookie']", "[class*='consent']", "[class*='share']",
    "[class*='social']", "[class*='subscribe']", "[class*='newsletter']",
    "[class*='ad-']", "[class*='advert']", "[class*='promo']",
    "[class*='related']", "[class*='recommended']",
    "[role='navigation']", "[role='banner']", "[role='complementary']",
  ];

  for (const sel of noiseSelectors) {
    clone.querySelectorAll(sel).forEach((el) => el.remove());
  }

  // Convert DOM to markdown
  const markdown = domToMarkdown(clone);

  // Get metadata
  const title = document.querySelector('meta[property="og:title"]')?.content
    || document.title || "";
  const description = document.querySelector('meta[property="og:description"]')?.content
    || document.querySelector('meta[name="description"]')?.content || "";

  return {
    url,
    title,
    description,
    markdown,
    charCount: markdown.length,
    wordCount: markdown.split(/\s+/).length,
  };
}

function domToMarkdown(el) {
  let md = "";

  function walk(node, depth = 0) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.replace(/\s+/g, " ");
      if (text.trim()) md += text;
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const tag = node.tagName.toLowerCase();

    // Skip hidden elements
    const style = window.getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") return;

    // Headings
    if (/^h[1-6]$/.test(tag)) {
      const level = parseInt(tag[1]);
      md += "\n" + "#".repeat(level) + " " + node.textContent.trim() + "\n\n";
      return;
    }

    // Code blocks
    if (tag === "pre") {
      const code = node.querySelector("code");
      const lang = code?.className?.match(/language-(\w+)/)?.[1] || "";
      const text = (code || node).textContent.trim();
      md += "\n```" + lang + "\n" + text + "\n```\n\n";
      return;
    }

    // Inline code
    if (tag === "code" && node.parentElement?.tagName !== "PRE") {
      md += "`" + node.textContent.trim() + "`";
      return;
    }

    // Links
    if (tag === "a") {
      const href = node.getAttribute("href") || "";
      const text = node.textContent.trim();
      if (text && href && !href.startsWith("#") && !href.startsWith("javascript:")) {
        md += "[" + text + "](" + href + ")";
      } else if (text) {
        md += text;
      }
      return;
    }

    // Images
    if (tag === "img") {
      const alt = node.getAttribute("alt") || "";
      const src = node.getAttribute("src") || "";
      if (alt && src) md += "![" + alt + "](" + src + ")";
      return;
    }

    // Bold
    if (tag === "strong" || tag === "b") {
      md += "**" + node.textContent.trim() + "**";
      return;
    }

    // Italic
    if (tag === "em" || tag === "i") {
      md += "*" + node.textContent.trim() + "*";
      return;
    }

    // Lists
    if (tag === "li") {
      const parent = node.parentElement?.tagName.toLowerCase();
      const index = Array.from(node.parentElement?.children || []).indexOf(node);
      const prefix = parent === "ol" ? (index + 1) + ". " : "- ";
      md += prefix;
      for (const child of node.childNodes) walk(child, depth + 1);
      md += "\n";
      return;
    }

    // Blockquote
    if (tag === "blockquote") {
      const text = node.textContent.trim();
      md += "\n" + text.split("\n").map((l) => "> " + l.trim()).join("\n") + "\n\n";
      return;
    }

    // Tables
    if (tag === "table") {
      const rows = node.querySelectorAll("tr");
      rows.forEach((row, i) => {
        const cells = row.querySelectorAll("th, td");
        md += "| " + Array.from(cells).map((c) => c.textContent.trim()).join(" | ") + " |\n";
        if (i === 0) md += "| " + Array.from(cells).map(() => "---").join(" | ") + " |\n";
      });
      md += "\n";
      return;
    }

    // Horizontal rule
    if (tag === "hr") {
      md += "\n---\n\n";
      return;
    }

    // Line break
    if (tag === "br") {
      md += "\n";
      return;
    }

    // Block elements — add paragraph breaks
    const isBlock = ["p", "div", "section", "article", "main", "figure", "figcaption", "details", "summary"].includes(tag);

    if (isBlock && tag === "p") md += "\n";

    for (const child of node.childNodes) {
      walk(child, depth);
    }

    if (isBlock) md += "\n";
  }

  walk(el);

  // Clean up
  return md
    .replace(/\n{4,}/g, "\n\n\n")
    .replace(/^\s+/gm, (m) => m.includes("\n") ? "\n" : "")
    .replace(/\*\*\s*\*\*/g, "")
    .replace(/\[\s*\]\(\s*\)/g, "")
    .trim();
}
