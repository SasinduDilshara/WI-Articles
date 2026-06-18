#!/usr/bin/env python3
"""Convert the three WI articles to clean, Google-Docs-friendly standalone HTML.

Each output file is meant to be opened in a browser, Select-All + Copy, then
pasted into its own tab in the target Google Doc. Pasting HTML into Google Docs
preserves headings, bold, lists, blockquotes, and code formatting.
"""
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(__file__).resolve().parent

# (source markdown, output html, tab title)
ARTICLES = [
    ("build-first-ai-integration.md",
     "tab1-first-ai-agent.html",
     "Part 1 — Your First AI Agent on WSO2 Integrator"),
    ("connect-live-data-with-mcp.md",
     "tab2-live-data-with-mcp.html",
     "Part 2 — Give Your AI Agent Live Data with MCP"),
    ("push-live-notifications-with-webhooks.md",
     "tab3-live-notifications-with-webhooks.html",
     "Part 3 — Push Live Notifications with Webhooks"),
]

# Image embeds: ![alt](something.png) -> visible "insert image" placeholder.
IMG_RE = re.compile(r'!\[([^\]]*)\]\(([^)]*\.(?:png|jpe?g|gif|svg))\)', re.IGNORECASE)
# Cross-article links to .md files (broken in Google Docs) -> bold plain text.
MD_LINK_RE = re.compile(r'\[([^\]]+)\]\((?:[^)]*\.md[^)]*)\)')
# Pure in-page anchor links -> just the text (anchors won't resolve once pasted).
ANCHOR_LINK_RE = re.compile(r'\[([^\]]+)\]\(#[^)]*\)')


def preprocess(md: str) -> str:
    md = IMG_RE.sub(
        lambda m: f'> 🖼️ **[INSERT IMAGE HERE — {m.group(1).strip() or m.group(2)}]**',
        md)
    md = MD_LINK_RE.sub(lambda m: f'**{m.group(1)}**', md)
    md = ANCHOR_LINK_RE.sub(lambda m: m.group(1), md)
    return md


CSS = """
body { font-family: Arial, Helvetica, sans-serif; line-height: 1.5; max-width: 820px;
       margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; }
h1 { font-size: 26px; } h2 { font-size: 21px; margin-top: 1.6em; }
h3 { font-size: 17px; } h4 { font-size: 15px; }
code { font-family: 'Courier New', monospace; background: #f3f3f3; padding: 1px 4px;
       border-radius: 3px; font-size: 0.95em; }
pre { background: #f5f5f5; padding: 12px; border-radius: 6px; overflow-x: auto;
      border: 1px solid #e0e0e0; }
pre code { background: none; padding: 0; }
blockquote { border-left: 4px solid #c8c8c8; margin: 1em 0; padding: 0.2em 1em;
             color: #444; background: #fafafa; }
a { color: #1155cc; }
"""


def build(src_name: str, out_name: str, title: str) -> None:
    src = ROOT / src_name
    md = preprocess(src.read_text(encoding="utf-8"))
    out = OUT / out_name
    subprocess.run(
        ["pandoc", "--from", "gfm", "--to", "html", "--standalone",
         "--metadata", f"title={title}", "--css", "inline",
         "-o", str(out)],
        input=md, text=True, check=True,
    )
    # Inline the CSS (pandoc's --css just links; we want a self-contained file).
    html = out.read_text(encoding="utf-8")
    html = html.replace('<link rel="stylesheet" href="inline" />',
                        f"<style>{CSS}</style>")
    out.write_text(html, encoding="utf-8")
    print(f"  {src_name}  ->  {out_name}")


if __name__ == "__main__":
    print("Building Google-Docs-friendly HTML tabs:")
    for a in ARTICLES:
        build(*a)
    print("Done.")
