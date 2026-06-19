import Link from "next/link";
import { listBlogPosts, getLanguageName } from "@/lib/blog";
import { getBlogTranslation } from "@/lib/blog-translations";
import { BlogIndexLanguageSelector } from "@/components/blog/BlogIndexLanguageSelector";

function formatYmd(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  const d = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function BlogIndexContent({ lang = "en" }: { lang?: string }) {
  const posts = listBlogPosts(lang);
  const isFallback = lang !== "en" && posts.length === 0;
  const displayPosts = isFallback ? listBlogPosts("en") : posts;
  const displayLang = isFallback ? "en" : lang;

  return (
    <div>
      <header className="mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl text-balance">
            {getBlogTranslation("title", lang)}
          </h1>
          <p className="mt-2 max-w-2xl text-base text-slate-600">
            {getBlogTranslation("desc", lang)}
          </p>
        </div>
        <div className="shrink-0">
          <BlogIndexLanguageSelector currentLang={lang} />
        </div>
      </header>

      {lang !== "en" && !isFallback && (
        <div className="mb-6 rounded-xl border border-blue-100 bg-blue-50/50 p-4 text-sm text-blue-900 flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top duration-300">
          <span>
            {getBlogTranslation("showingTranslated", lang)} <strong>{getLanguageName(lang)}</strong>.
          </span>
          <Link href="/blog" className="font-semibold text-blue-700 hover:text-blue-800 hover:underline shrink-0">
            {getBlogTranslation("showAllEnglish", lang)}
          </Link>
        </div>
      )}

      {lang !== "en" && isFallback && (
        <div className="mb-6 rounded-xl border border-amber-100 bg-amber-50/50 p-4 text-sm text-amber-900 flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top duration-300">
          <span>
            {getBlogTranslation("noTranslationsYet", lang)} <strong>{getLanguageName(lang)}</strong>{getBlogTranslation("noTranslationsYetSuffix", lang)}
          </span>
          <Link href="/blog" className="font-semibold text-amber-700 hover:text-amber-800 hover:underline shrink-0">
            {getBlogTranslation("clearFilter", lang)}
          </Link>
        </div>
      )}

      {displayPosts.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700">
          {getBlogTranslation("noPosts", lang)}
        </div>
      ) : (
        <ol className="space-y-4" aria-label="Blog posts">
          {displayPosts.map((p) => {
            const href = displayLang === "en" ? `/blog/${p.slug}` : `/blog/${displayLang}/${p.slug}`;
            return (
              <li
                key={p.slug}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <Link
                      href={href}
                      className="text-lg font-bold text-slate-950 hover:underline"
                    >
                      {p.title}
                    </Link>
                    {p.description ? (
                      <p className="mt-1 text-sm text-slate-600">
                        {p.description}
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600">
                      <span className="rounded-md bg-slate-100 px-2 py-1">
                        {formatYmd(p.date)}
                      </span>
                      <span className="rounded-md bg-slate-100 px-2 py-1">
                        {p.readingTimeMinutes} {getBlogTranslation("minRead", lang)}
                      </span>
                      {p.tags.slice(0, 4).map((t) => (
                        <span
                          key={t}
                          className="rounded-md bg-blue-50 px-2 py-1 text-blue-800"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  <Link
                    href={href}
                    className="inline-flex shrink-0 items-center justify-center rounded-lg border border-blue-600 bg-white px-4 py-2 text-sm font-bold text-blue-600 hover:bg-blue-600 hover:text-white"
                  >
                    {getBlogTranslation("read", lang).replace(" →", "")}
                  </Link>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
