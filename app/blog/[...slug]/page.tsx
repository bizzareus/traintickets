import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getBlogPost, listBlogPostSlugs, listBlogPosts, parseFaqFromMarkdown, hasBlogPostTranslation, mapStateToLanguage, getLanguageName, getAvailableTranslations } from "@/lib/blog";
import { parseHowToFromMarkdown } from "@/lib/seo/schema-howto";
import { autoLinkGlossaryTerms } from "@/lib/seo/auto-linker";
import { headers } from "next/headers";
import { LanguagePromptSheet } from "@/components/blog/LanguagePromptSheet";
import { BlogLanguageSelector } from "@/components/blog/BlogLanguageSelector";
import { AuthorBio } from "@/components/blog/AuthorBio";
import { OfficialSources } from "@/components/blog/OfficialSources";
import { BlogIndexContent } from "@/components/blog/BlogIndexContent";

export const dynamicParams = false;

export async function generateStaticParams() {
  const params: { slug: string[] }[] = [];
  
  // English posts: /blog/my-post
  for (const slug of listBlogPostSlugs("en")) {
    params.push({ slug: [slug] });
  }
  
  // Regional posts: /blog/hi/my-post
  const langs = ["mr", "hi", "bn", "ta", "te", "ml"];
  for (const lang of langs) {
    for (const slug of listBlogPostSlugs(lang)) {
      params.push({ slug: [lang, slug] });
    }
  }
  
  // Regional index pages: /blog/hi
  for (const lang of langs) {
    params.push({ slug: [lang] });
  }
  
  return params;
}

type BlogPostPageProps = {
  params: Promise<{ slug: string[] }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export async function generateMetadata({
  params,
}: BlogPostPageProps): Promise<Metadata> {
  const { slug: slugArray } = await params;

  // Case 1: Regional index page, e.g. /blog/hi
  if (slugArray.length === 1 && ["mr", "hi", "bn", "ta", "te", "ml"].includes(slugArray[0])) {
    const lang = slugArray[0];
    const canonicalUrl = `/blog/${lang}`;
    const allLangs = ["en", "mr", "hi", "bn", "ta", "te", "ml"];
    const languages: Record<string, string> = {};
    for (const l of allLangs) {
      const url = l === "en" ? "/blog" : `/blog/${l}`;
      languages[l] = url;
      languages[`${l}-IN`] = url;
    }
    languages["x-default"] = "/blog";

    return {
      title: `Read & Find Confirmed Train Tickets | IRCTC Booking Guides (${getLanguageName(lang)})`,
      alternates: {
        canonical: canonicalUrl,
        languages,
      },
    };
  }

  // Case 2: Blog post page
  let lang = "en";
  let slug = slugArray[0];
  if (slugArray.length === 2) {
    lang = slugArray[0];
    slug = slugArray[1];
  } else if (slugArray.length > 2) {
    return {};
  }

  const post = getBlogPost(slug, lang);
  if (!post) return {};
  
  const canonicalUrl = lang === "en" ? `/blog/${post.slug}` : `/blog/${lang}/${post.slug}`;
  const availableLangs = getAvailableTranslations(post.slug);
  const languages: Record<string, string> = {};
  for (const l of availableLangs) {
    const url = l === "en" ? `/blog/${post.slug}` : `/blog/${l}/${post.slug}`;
    languages[l] = url;
    languages[`${l}-IN`] = url;
  }
  languages["x-default"] = `/blog/${post.slug}`;
  
  return {
    title: post.title,
    description: post.description,
    alternates: { 
      canonical: canonicalUrl,
      languages
    },
    openGraph: {
      type: "article",
      url: canonicalUrl,
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

export default async function BlogPostPage({ params, searchParams }: BlogPostPageProps) {
  const { slug: slugArray } = await params;
  
  // Case 1: Regional index page, e.g. /blog/hi
  if (slugArray.length === 1 && ["mr", "hi", "bn", "ta", "te", "ml"].includes(slugArray[0])) {
    const lang = slugArray[0];
    return <BlogIndexContent lang={lang} />;
  }

  // Case 2: Blog post page
  let lang = "en";
  let slug = slugArray[0];
  if (slugArray.length === 2) {
    lang = slugArray[0];
    slug = slugArray[1];
  } else if (slugArray.length > 2) {
    notFound();
  }

  const post = getBlogPost(slug, lang);
  if (!post) notFound();

  // Detect region for language prompt ONLY if it's the English version
  let showPrompt = false;
  let suggestedLang = "";
  if (lang === "en") {
    const headersList = await headers();
    const searchProps = searchParams ? await searchParams : {};
    const regionCode = (searchProps.region as string) || headersList.get("x-vercel-ip-country-region") || "";
    suggestedLang = mapStateToLanguage(regionCode) || "";
    showPrompt = suggestedLang ? hasBlogPostTranslation(slug, suggestedLang) : false;
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "https://lastberth.com");
  const baseUrl =
    typeof siteUrl === "string" && siteUrl.startsWith("http")
      ? siteUrl
      : "https://lastberth.com";

  const canonicalUrl = lang === "en" ? `${baseUrl}/blog/${post.slug}` : `${baseUrl}/blog/${lang}/${post.slug}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.updated ?? post.date,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": canonicalUrl,
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

  const faqEntries = parseFaqFromMarkdown(post.content);
  const faqJsonLd = faqEntries.length > 0 ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqEntries.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  } : null;

  const allPosts = listBlogPosts(lang);
  
  const howToData = parseHowToFromMarkdown(post.content);
  const howToJsonLd = howToData ? {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: howToData.name,
    step: howToData.steps.map((step, index) => ({
      "@type": "HowToStep",
      name: step.name,
      text: step.text,
      url: `${canonicalUrl}#step-${index + 1}`
    }))
  } : null;
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

  const availableLangs = getAvailableTranslations(post.slug);

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
        {availableLangs.length > 1 && (
          <div className="mt-6 border-t border-slate-100 pt-4">
            <BlogLanguageSelector 
              availableLangs={availableLangs} 
              currentLang={lang} 
              currentSlug={post.slug} 
            />
          </div>
        )}
      </header>

      <div className="prose prose-slate max-w-none prose-headings:scroll-mt-24">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {autoLinkGlossaryTerms(post.content)}
        </ReactMarkdown>
      </div>

      <OfficialSources sources={post.sources} />
      <AuthorBio />

      {relatedPosts.length > 0 ? (
        <div className="mt-12 border-t border-slate-100 pt-8">
          <h2 className="text-xl font-bold text-slate-900 mb-6">
            Recommended Reading
          </h2>
          <div className="grid gap-6 sm:grid-cols-3">
            {relatedPosts.map((p) => (
              <Link
                key={p.slug}
                href={lang === "en" ? `/blog/${p.slug}` : `/blog/${lang}/${p.slug}`}
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
      {faqJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
      ) : null}
      {howToJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(howToJsonLd) }}
        />
      ) : null}
      
      {showPrompt && suggestedLang && (
        <LanguagePromptSheet 
          suggestedLang={suggestedLang} 
          currentSlug={slug} 
          langName={getLanguageName(suggestedLang)}
        />
      )}
    </article>
  );
}
