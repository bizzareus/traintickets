#!/usr/bin/env python3
"""
LastBerth SEO Intent Matcher & Weekly Triage Automation Script

Workflow:
1. Ingests GSC query data (or keyword list with impressions & CTR).
2. Cross-checks queries against the site sitemap & existing blog posts (content/blog/*.md).
3. If an existing page serves the keyword intent:
   - Marks for AUTO-OPTIMIZATION (Title/Meta CTR rewrite, H2 fan-out, top tool CTA).
4. If no existing page matches the keyword intent:
   - Adds keyword to candidate queue in `memory/new-keyword-candidates.md` for review & scheduled generation.
"""

import os
import sys
import glob
import re
import json

CONTENT_DIR = "content/blog"
CANDIDATES_FILE = "memory/new-keyword-candidates.md"

def load_existing_pages():
    pages = []
    files = glob.glob(os.path.join(CONTENT_DIR, "*.md"))
    for fpath in files:
        slug = os.path.basename(fpath).replace(".md", "")
        with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
            text = f.read()
        
        # Extract title and headings
        title = ""
        title_match = re.search(r'^title:\s*"(.*?)"', text, re.MULTILINE)
        if title_match:
            title = title_match.group(1)
        
        headings = re.findall(r'^##\s+(.*?)$', text, re.MULTILINE)
        
        pages.append({
            "slug": slug,
            "fpath": fpath,
            "title": title,
            "headings": headings,
            "text": text.lower()
        })
    return pages

def match_keyword_intent(query, pages):
    query_clean = re.sub(r'[^a-zA-Z0-9\s]', '', query.lower())
    query_tokens = set(query_clean.split())
    
    # Filter out common stop words
    stop_words = {"in", "on", "at", "for", "to", "is", "a", "an", "the", "of", "and", "or", "what", "how", "can", "do", "does", "with", "from"}
    meaningful_tokens = query_tokens - stop_words
    
    if not meaningful_tokens:
        meaningful_tokens = query_tokens

    best_match = None
    best_score = 0.0

    for page in pages:
        # Check slug match
        slug_tokens = set(re.sub(r'[^a-zA-Z0-9\s]', ' ', page["slug"]).split())
        title_tokens = set(re.sub(r'[^a-zA-Z0-9\s]', ' ', page["title"].lower()).split())
        
        # Token overlap score
        slug_overlap = len(meaningful_tokens & slug_tokens) / len(meaningful_tokens)
        title_overlap = len(meaningful_tokens & title_tokens) / len(meaningful_tokens)
        
        # Check headings match
        heading_overlap = 0.0
        for h in page["headings"]:
            h_tokens = set(re.sub(r'[^a-zA-Z0-9\s]', ' ', h.lower()).split())
            ov = len(meaningful_tokens & h_tokens) / len(meaningful_tokens)
            if ov > heading_overlap:
                heading_overlap = ov

        score = max(slug_overlap * 0.9, title_overlap * 0.8, heading_overlap * 0.7)
        if score > best_score:
            best_score = score
            best_match = page

    # Match threshold (>= 0.50 means existing page covers intent)
    if best_score >= 0.50:
        return {"matched": True, "page": best_match, "score": round(best_score, 2)}
    else:
        return {"matched": False, "page": None, "score": round(best_score, 2)}

def process_query_list(query_data):
    pages = load_existing_pages()
    
    to_optimize = []
    to_create_new = []

    for item in query_data:
        q = item["query"]
        imp = item.get("impressions", 0)
        ctr = item.get("ctr", 0.0)
        pos = item.get("position", 0.0)

        result = match_keyword_intent(q, pages)
        if result["matched"]:
            to_optimize.append({
                "query": q,
                "impressions": imp,
                "ctr": ctr,
                "position": pos,
                "target_slug": result["page"]["slug"],
                "target_file": result["page"]["fpath"],
                "match_score": result["score"]
            })
        else:
            to_create_new.append({
                "query": q,
                "impressions": imp,
                "ctr": ctr,
                "position": pos,
                "match_score": result["score"]
            })

    return to_optimize, to_create_new

if __name__ == "__main__":
    print("SEO Intent Matcher initialized.")
