import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { cache } from "react";

export type BlogPostMeta = {
  slug: string;
  title: string;
  description: string;
  /** ISO date `YYYY-MM-DD`. */
  date: string;
  /** ISO date `YYYY-MM-DD`. */
  updated: string | null;
  tags: string[];
  readingTimeMinutes: number;
};

export type BlogPost = BlogPostMeta & {
  content: string;
};

const BLOG_DIR = path.join(process.cwd(), "content", "blog");

function safeReadDir(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

function ymdOrNull(raw: unknown): string | null {
  const s = String(raw ?? "")
    .trim()
    .slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const t = String(item ?? "")
      .trim()
      .toLowerCase();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function estimateReadingTimeMinutes(markdown: string): number {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/[#>*_[\](){}/\\|~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return 1;
  const words = text.split(" ").filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

function parseMetaFromMatter(
  slug: string,
  data: Record<string, unknown>,
  content: string,
): BlogPostMeta {
  const title =
    typeof data.title === "string" && data.title.trim()
      ? data.title.trim()
      : slug;
  const description =
    typeof data.description === "string" && data.description.trim()
      ? data.description.trim()
      : "";
  const date = ymdOrNull(data.date) ?? "1970-01-01";
  const updated = ymdOrNull(data.updated);
  const tags = normalizeTags(data.tags);
  const readingTimeMinutes = estimateReadingTimeMinutes(content);
  return {
    slug,
    title,
    description,
    date,
    updated,
    tags,
    readingTimeMinutes,
  };
}

function postPathForSlug(slug: string): string {
  return path.join(BLOG_DIR, `${slug}.md`);
}

export const listBlogPostSlugs = cache((): string[] => {
  const files = safeReadDir(BLOG_DIR);
  const slugs = files
    .filter((f) => f.toLowerCase().endsWith(".md"))
    .map((f) => f.slice(0, -3))
    .filter((s) => s.length > 0);
  slugs.sort();
  return slugs;
});

export const listBlogPosts = cache((): BlogPostMeta[] => {
  const metas: BlogPostMeta[] = [];
  for (const slug of listBlogPostSlugs()) {
    const p = postPathForSlug(slug);
    let raw = "";
    try {
      raw = fs.readFileSync(p, "utf8");
    } catch {
      continue;
    }
    const { data, content } = matter(raw);
    metas.push(
      parseMetaFromMatter(slug, data as Record<string, unknown>, content),
    );
  }
  metas.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return metas;
});

export const getBlogPost = cache((slug: string): BlogPost | null => {
  const s = String(slug ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
  if (!s) return null;
  const p = postPathForSlug(s);
  let raw = "";
  try {
    raw = fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
  const { data, content } = matter(raw);
  const meta = parseMetaFromMatter(s, data as Record<string, unknown>, content);
  return { ...meta, content };
});
