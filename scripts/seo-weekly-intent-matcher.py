#!/usr/bin/env python3
"""
LastBerth SEO Intent Matcher & Search Console CLI Triage Tool

Workflow:
1. Ingests GSC query data from data/gsc/latest/ (optionally fetches fresh via --fetch).
2. Computes Headroom Opportunity Scores (CTR Bleeders, Page-2 Near Misses).
3. Cross-checks queries against existing markdown posts in content/blog/*.md.
4. If an existing page matches the query intent (overlap >= 50%):
   - Categorizes as EXPAND or CTR REWRITE with calculated lost-click headroom.
5. If no existing page matches (overlap < 50%):
   - Clusters high-impression queries (Imp >= 250) as NEW ARTICLE CANDIDATES.
   - Updates memory/new-keyword-candidates.md automatically.

Usage:
  python3 scripts/seo-weekly-intent-matcher.py
  python3 scripts/seo-weekly-intent-matcher.py --fetch
  python3 scripts/seo-weekly-intent-matcher.py --min-imp 150
"""

import os
import sys
import glob
import re
import csv
import json
import argparse
import subprocess

CONTENT_DIR = "content/blog"
CANDIDATES_FILE = "memory/new-keyword-candidates.md"
GSC_QUERIES_FILE = "data/gsc/latest/Queries.csv"
GSC_PAGES_FILE = "data/gsc/latest/Pages.csv"
GSC_PAGES_QUERIES_FILE = "data/gsc/latest/Pages_and_Queries.csv"

def expected_ctr(pos):
    if pos <= 1.5:
        return 0.28
    elif pos <= 2.5:
        return 0.15
    elif pos <= 3.5:
        return 0.10
    elif pos <= 5.5:
        return 0.06
    elif pos <= 7.5:
        return 0.04
    elif pos <= 10.5:
        return 0.025
    elif pos <= 20.5:
        return 0.010
    return 0.005

def load_existing_pages():
    pages = []
    files = glob.glob(os.path.join(CONTENT_DIR, "*.md"))
    for fpath in files:
        slug = os.path.basename(fpath).replace(".md", "")
        with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
            text = f.read()
        
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
    
    stop_words = {
        "in", "on", "at", "for", "to", "is", "a", "an", "the", "of", "and", "or",
        "what", "how", "can", "do", "does", "with", "from", "by", "are", "me", "my"
    }
    meaningful_tokens = query_tokens - stop_words
    
    if not meaningful_tokens:
        meaningful_tokens = query_tokens

    if not meaningful_tokens:
        return {"matched": False, "page": None, "score": 0.0}

    best_match = None
    best_score = 0.0

    for page in pages:
        slug_tokens = set(re.sub(r'[^a-zA-Z0-9\s]', ' ', page["slug"]).split())
        title_tokens = set(re.sub(r'[^a-zA-Z0-9\s]', ' ', page["title"].lower()).split())
        
        slug_overlap = len(meaningful_tokens & slug_tokens) / len(meaningful_tokens)
        title_overlap = len(meaningful_tokens & title_tokens) / len(meaningful_tokens)
        
        heading_overlap = 0.0
        for h in page["headings"]:
            h_tokens = set(re.sub(r'[^a-zA-Z0-9\s]', ' ', h.lower()).split())
            if meaningful_tokens:
                ov = len(meaningful_tokens & h_tokens) / len(meaningful_tokens)
                if ov > heading_overlap:
                    heading_overlap = ov

        score = max(slug_overlap * 0.9, title_overlap * 0.8, heading_overlap * 0.7)
        if score > best_score:
            best_score = score
            best_match = page

    # Match threshold: >= 0.50 means existing page covers intent
    if best_score >= 0.50:
        return {"matched": True, "page": best_match, "score": round(best_score, 2)}
    else:
        return {"matched": False, "page": None, "score": round(best_score, 2)}

def update_candidate_queue(new_candidates, candidates_path=CANDIDATES_FILE):
    if not os.path.exists(candidates_path):
        return

    with open(candidates_path, "r", encoding="utf-8") as f:
        existing_content = f.read()

    added_count = 0
    lines_to_add = []

    for c in new_candidates:
        q = c["query"]
        imp = c["impressions"]
        pos = c["position"]
        suggested_title = c.get("suggested_title", f"{q.title()}: Meaning, Rules & Guide (2026)")
        
        # Check if already present in file
        if q.lower() in existing_content.lower():
            continue

        row = f"| 2026-10-28 | `{q}` | High ({imp:,.0f} imp) | Pos {pos:.1f} (Uncovered GSC) | _{suggested_title}_ | ⏳ Queued |"
        lines_to_add.append(row)
        added_count += 1

    if lines_to_add:
        # Find the table in candidates file and insert
        pattern = r"(\| Date Added \|.*?\n\| :?---.*?\n)"
        match = re.search(pattern, existing_content)
        if match:
            insertion_point = match.end()
            new_rows_str = "\n".join(lines_to_add) + "\n"
            updated_content = existing_content[:insertion_point] + new_rows_str + existing_content[insertion_point:]
            with open(candidates_path, "w", encoding="utf-8") as f:
                f.write(updated_content)

    return added_count

def run_triage(min_imp=150, fetch_fresh=False):
    if fetch_fresh:
        print("⏳ Running 'npm run gsc:fetch' to extract fresh Search Console dataset...")
        res = subprocess.run(["npm", "run", "gsc:fetch"], capture_output=True, text=True)
        if res.returncode != 0:
            print(f"⚠️ GSC fetch failed: {res.stderr}")
        else:
            print("✅ Fresh GSC data fetched successfully.")

    if not os.path.exists(GSC_QUERIES_FILE):
        print(f"❌ Queries file not found: {GSC_QUERIES_FILE}. Run 'npm run gsc:fetch' first.")
        sys.exit(1)

    pages = load_existing_pages()
    print(f"📂 Loaded {len(pages)} existing English blog posts.")

    queries = []
    with open(GSC_QUERIES_FILE, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            q = row["Top queries"].strip()
            if not q:
                continue
            imp = float(row["Impressions"])
            clicks = float(row["Clicks"])
            pos = float(row["Position"])
            ctr = float(row["CTR"].replace("%", "")) / 100.0

            if imp >= min_imp:
                queries.append({
                    "query": q,
                    "impressions": imp,
                    "clicks": clicks,
                    "position": pos,
                    "ctr": ctr
                })

    print(f"📊 Analyzing {len(queries)} search queries with >= {min_imp} impressions...\n")

    ctr_bleeders = []
    page2_near_misses = []
    uncovered_candidates = []

    for item in queries:
        q = item["query"]
        imp = item["impressions"]
        clicks = item["clicks"]
        pos = item["position"]
        ctr = item["ctr"]

        res = match_keyword_intent(q, pages)

        if res["matched"]:
            target_slug = res["page"]["slug"]
            # Page 1 CTR Bleeder Check
            if pos <= 10.5:
                exp_ctr = expected_ctr(pos)
                if ctr < exp_ctr:
                    headroom = imp * (exp_ctr - ctr)
                    ctr_bleeders.append({
                        "query": q,
                        "target_slug": target_slug,
                        "impressions": imp,
                        "clicks": clicks,
                        "ctr": ctr,
                        "position": pos,
                        "headroom": headroom,
                        "match_score": res["score"]
                    })
            # Page 2 Near Miss Check
            elif 10.5 < pos <= 20.5:
                headroom = imp * max(0, 0.05 - ctr)
                page2_near_misses.append({
                    "query": q,
                    "target_slug": target_slug,
                    "impressions": imp,
                    "clicks": clicks,
                    "ctr": ctr,
                    "position": pos,
                    "headroom": headroom,
                    "match_score": res["score"]
                })
        else:
            # Uncovered query (Potential new content)
            if imp >= 250:
                uncovered_candidates.append({
                    "query": q,
                    "impressions": imp,
                    "clicks": clicks,
                    "position": pos,
                    "ctr": ctr,
                    "match_score": res["score"]
                })

    # Sort results
    ctr_bleeders.sort(key=lambda x: x["headroom"], reverse=True)
    page2_near_misses.sort(key=lambda x: x["headroom"], reverse=True)
    uncovered_candidates.sort(key=lambda x: x["impressions"], reverse=True)

    print("=" * 80)
    print("🎯 TOP PAGE-1 CTR BLEEDERS (Action: CTR REWRITE on Existing Article)")
    print("=" * 80)
    for b in ctr_bleeders[:10]:
        print(f"• Headroom: +{b['headroom']:.0f} clicks | Query: '{b['query']}'")
        print(f"  Target: content/blog/{b['target_slug']}.md | Imp: {b['impressions']:,.0f} | Pos: {b['position']:.1f} | CTR: {b['ctr']*100:.2f}%\n")

    print("=" * 80)
    print("🚀 TOP PAGE-2 NEAR MISSES (Action: EXPAND with H2 Fan-Out on Existing Article)")
    print("=" * 80)
    for m in page2_near_misses[:10]:
        print(f"• Headroom: +{m['headroom']:.0f} clicks | Query: '{m['query']}'")
        print(f"  Target: content/blog/{m['target_slug']}.md | Imp: {m['impressions']:,.0f} | Pos: {m['position']:.1f}\n")

    print("=" * 80)
    print("✨ TOP UNCOVERED KEYWORD CANDIDATES (Action: WRITE NEW - Playbook E)")
    print("=" * 80)
    for u in uncovered_candidates[:10]:
        print(f"• Demand: {u['impressions']:,.0f} imp | Pos: {u['position']:.1f} | Query: '{u['query']}' (Overlap: {u['match_score']*100:.0f}%)")

    # Update candidate queue file
    added = update_candidate_queue(uncovered_candidates[:10])
    if added:
        print(f"\n📝 Added {added} new candidates to {CANDIDATES_FILE}")

    return {
        "ctr_bleeders": ctr_bleeders[:15],
        "page2_near_misses": page2_near_misses[:15],
        "uncovered_candidates": uncovered_candidates[:15]
    }

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="LastBerth SEO Intent Matcher & Triage CLI")
    parser.add_argument("--fetch", action="store_true", help="Fetch fresh GSC performance data before triage")
    parser.add_argument("--min-imp", type=int, default=150, help="Minimum impression threshold (default: 150)")
    parser.add_argument("--json-out", type=str, help="Save triage results to a JSON file")

    args = parser.parse_args()
    results = run_triage(min_imp=args.min_imp, fetch_fresh=args.fetch)

    if args.json_out:
        with open(args.json_out, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2)
        print(f"\n💾 Triage report saved to {args.json_out}")
