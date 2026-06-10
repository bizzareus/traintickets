import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getBlogPost, listBlogPostSlugs, listBlogPosts } from "@/lib/blog";

export const dynamicParams = false;

export async function generateStaticParams() {
  return listBlogPostSlugs().map((slug) => ({ slug }));
}

type BlogPostPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      url: `/blog/${post.slug}`,
      title: post.title,
      description: post.description,
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
    },
  };
}

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

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) notFound();

  const siteUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "https://lastberth.com");
  const baseUrl =
    typeof siteUrl === "string" && siteUrl.startsWith("http")
      ? siteUrl
      : "https://lastberth.com";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.updated ?? post.date,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${baseUrl}/blog/${post.slug}`,
    },
    author: {
      "@type": "Organization",
      name: "LastBerth",
      url: baseUrl,
    },
    publisher: {
      "@type": "Organization",
      name: "LastBerth",
      logo: {
        "@type": "ImageObject",
        url: `${baseUrl}/favicon.svg`,
      },
    },
    image: [
      `${baseUrl}/opengraph-image`,
    ],
  };

  const allPosts = listBlogPosts();
  const otherPosts = allPosts.filter((p) => p.slug !== post.slug);
  const relatedPosts = otherPosts
    .map((p) => {
      const sharedTags = p.tags.filter((tag) => post.tags.includes(tag)).length;
      return { post: p, sharedTags };
    })
    .sort((a, b) => {
      if (b.sharedTags !== a.sharedTags) {
        return b.sharedTags - a.sharedTags;
      }
      return b.post.date.localeCompare(a.post.date);
    })
    .slice(0, 3)
    .map((x) => x.post);

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <header className="mb-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
          {post.title}
        </h1>
        {post.description ? (
          <p className="mt-3 text-base text-slate-600">{post.description}</p>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600">
          <span className="rounded-md bg-slate-100 px-2 py-1">
            {formatYmd(post.date)}
          </span>
          {post.updated ? (
            <span className="rounded-md bg-slate-100 px-2 py-1">
              Updated {formatYmd(post.updated)}
            </span>
          ) : null}
          <span className="rounded-md bg-slate-100 px-2 py-1">
            {post.readingTimeMinutes} min read
          </span>
          {post.tags.slice(0, 6).map((t) => (
            <span
              key={t}
              className="rounded-md bg-blue-50 px-2 py-1 text-blue-800"
            >
              {t}
            </span>
          ))}
        </div>
      </header>

      <div className="prose prose-slate max-w-none prose-headings:scroll-mt-24">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {post.content}
        </ReactMarkdown>
      </div>

      {relatedPosts.length > 0 ? (
        <div className="mt-12 border-t border-slate-100 pt-8">
          <h2 className="text-xl font-bold text-slate-900 mb-6">
            Recommended Reading
          </h2>
          <div className="grid gap-6 sm:grid-cols-3">
            {relatedPosts.map((p) => (
              <Link
                key={p.slug}
                href={`/blog/${p.slug}`}
                className="group flex flex-col justify-between rounded-xl border border-slate-100 bg-slate-50/50 p-4 hover:bg-slate-50 hover:shadow-xs transition-all duration-200"
              >
                <div>
                  <h3 className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-2 text-sm leading-snug">
                    {p.title}
                  </h3>
                  {p.description ? (
                    <p className="mt-2 text-xs text-slate-500 line-clamp-3">
                      {p.description}
                    </p>
                  ) : null}
                </div>
                <div className="mt-4 flex items-center justify-between text-[10px] font-semibold text-slate-600">
                  <span>{formatYmd(p.date)}</span>
                  <span className="text-blue-600 font-bold group-hover:underline">
                    Read →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </article>
  );
}
