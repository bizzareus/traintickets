import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  GLOSSARY_TERMS,
  GLOSSARY_LANGS,
  isGlossaryLang,
  getAllGlossaryTermsForLang,
  getGlossaryTermForLang,
} from "@/lib/seo/glossary-db";
import { glossaryUi } from "@/lib/seo/glossary-ui";
import {
  buildOpenGraph,
  buildTwitterCard,
  truncateMetaDescription,
  truncateTitle,
} from "@/lib/seo/metadata";
import { GlossaryLanguageSelector } from "@/components/glossary/GlossaryLanguageSelector";

export const dynamicParams = false;

const NON_EN_LANGS = GLOSSARY_LANGS.filter((l) => l !== "en");

export async function generateStaticParams() {
  const params: { slug: string[] }[] = [];
  // English term pages: /glossary/<term>
  for (const t of GLOSSARY_TERMS) params.push({ slug: [t.id] });
  // Language index pages: /glossary/<lang>
  for (const lang of NON_EN_LANGS) params.push({ slug: [lang] });
  // Translated term pages: /glossary/<lang>/<term>
  for (const lang of NON_EN_LANGS) {
    for (const t of GLOSSARY_TERMS) params.push({ slug: [lang, t.id] });
  }
  return params;
}

type Props = { params: Promise<{ slug: string[] }> };

/** Parse a slug into { lang, termId } or null if it's not a valid glossary route. */
function parseSlug(slug: string[]): { lang: string; termId?: string } | null {
  if (slug.length === 1) {
    if (isGlossaryLang(slug[0]) && slug[0] !== "en") return { lang: slug[0] };
    return { lang: "en", termId: slug[0] };
  }
  if (slug.length === 2 && isGlossaryLang(slug[0]) && slug[0] !== "en") {
    return { lang: slug[0], termId: slug[1] };
  }
  return null;
}

function canonicalFor(lang: string, termId?: string): string {
  if (lang === "en") return termId ? `/glossary/${termId}` : "/glossary";
  return termId ? `/glossary/${lang}/${termId}` : `/glossary/${lang}`;
}

function hreflangAlternates(termId?: string): Record<string, string> {
  const langs: Record<string, string> = {};
  for (const lang of GLOSSARY_LANGS) langs[lang] = canonicalFor(lang, termId);
  langs["x-default"] = canonicalFor("en", termId);
  return langs;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const parsed = parseSlug(slug);
  if (!parsed) return {};
  const { lang, termId } = parsed;

  if (termId) {
    const item = getGlossaryTermForLang(termId, lang);
    if (!item) return {};
    const ui = glossaryUi(lang);
    const canonical = canonicalFor(lang, termId);
    const shortTerm = item.term.replace(/\s*\([^)]*\)$/, "").trim();
    const title =
      lang === "en"
        ? `What is ${shortTerm}? — Railway Glossary`
        : truncateTitle(`${shortTerm} — ${ui.crumb}`, 48);
    const description = truncateMetaDescription(
      `Meaning of ${item.term} in Indian Railway bookings. ${item.definition}`,
    );
    const fullTitle = `${title} | LastBerth`;
    return {
      title,
      description,
      alternates: {
        canonical,
        languages: hreflangAlternates(termId),
      },
      openGraph: buildOpenGraph({
        title: fullTitle,
        description,
        url: canonical,
        type: "article",
        lang,
      }),
      twitter: buildTwitterCard({
        title: fullTitle,
        description,
      }),
    };
  }

  const ui = glossaryUi(lang);
  const canonical = canonicalFor(lang);
  const description = truncateMetaDescription(ui.subtitle);
  const indexTitle = truncateTitle(ui.title, 48);
  const fullIndexTitle = `${indexTitle} | LastBerth`;
  return {
    title: indexTitle,
    description,
    alternates: {
      canonical,
      languages: hreflangAlternates(),
    },
    openGraph: buildOpenGraph({
      title: fullIndexTitle,
      description,
      url: canonical,
      lang,
    }),
    twitter: buildTwitterCard({
      title: fullIndexTitle,
      description,
    }),
  };
}

export default async function GlossarySlugPage({ params }: Props) {
  const { slug } = await params;
  const parsed = parseSlug(slug);
  if (!parsed) notFound();
  const { lang, termId } = parsed;
  const ui = glossaryUi(lang);

  // ---- Term detail ----
  if (termId) {
    const item = getGlossaryTermForLang(termId, lang);
    if (!item) notFound();
    const related = (item.relatedTerms || [])
      .map((id) => getGlossaryTermForLang(id, lang))
      .filter(Boolean) as (typeof item)[];

    const breadcrumbJsonLd = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: "https://lastberth.com/",
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Glossary",
          item: "https://lastberth.com/glossary",
        },
        {
          "@type": "ListItem",
          position: 3,
          name: item.term,
          item: `https://lastberth.com${canonicalFor(lang, termId)}`,
        },
      ],
    };

    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "DefinedTerm",
      name: item.term,
      description: item.definition,
      inDefinedTermSet: "https://lastberth.com/glossary",
    };

    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <nav className="flex text-sm text-slate-500" aria-label="Breadcrumb">
            <Link
              href={lang === "en" ? "/" : `/${lang}`}
              className="hover:text-blue-600 hover:underline"
            >
              LastBerth
            </Link>
            <span className="mx-2">/</span>
            <Link
              href={canonicalFor(lang)}
              className="hover:text-blue-600 hover:underline"
            >
              {lang === "en" ? "Railway Glossary" : ui.crumb}
            </Link>
            <span className="mx-2">/</span>
            <span className="text-slate-900">{item.term}</span>
          </nav>
          <GlossaryLanguageSelector
            currentLang={lang}
            termId={termId}
            languageLabel={ui.language}
          />
        </div>

        <article className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            {item.term}
          </h1>
          <div className="prose prose-lg prose-slate mt-8 max-w-none">
            <p className="lead text-xl font-medium text-slate-700">
              {item.definition}
            </p>
          </div>

          <section className="mt-10 space-y-4 rounded-xl border border-slate-100 bg-slate-50 p-6">
            <h2 className="text-lg font-bold text-slate-900">
              Using {item.term} on IRCTC &amp; LastBerth Railway Glossary
            </h2>
            <p className="text-sm leading-relaxed text-slate-600">
              Understanding {item.term} helps when checking live ticket
              availability, tracking reservation chart preparation, or deciding
              whether to wait for confirmation versus booking an alternate
              split-berth or current-availability seat. Across the Indian
              Railways reservation network, waiting-list clearance follows quota
              priority: General Waiting List (GNWL) clears first from the
              originating station, followed by Remote Location (RLWL) and Pooled
              Quota (PQWL).
            </p>
            <p className="text-sm leading-relaxed text-slate-600">
              The first reservation chart is normally finalized around four
              hours before origin departure (or 20:00–21:00 the previous evening
              for early morning trains), with a second chart prepared 30 to 60
              minutes before departure. Unbooked berths released after charting
              appear under Current Availability (CURR_AVBL) and can be spotted
              instantly using LastBerth&apos;s live seat and chart tools or
              explored further in the{" "}
              <Link
                href={canonicalFor(lang)}
                className="font-medium text-blue-700 hover:underline"
              >
                Indian Railway Glossary
              </Link>
              .
            </p>
            <div className="flex flex-wrap gap-3 pt-1 text-sm font-medium">
              <Link
                href="/pnr-status"
                className="text-blue-700 hover:underline"
              >
                Check Live PNR Status →
              </Link>
              <Link
                href="/chart-vacancy"
                className="text-blue-700 hover:underline"
              >
                View Chart Vacancy →
              </Link>
              <Link
                href="/chart-times"
                className="text-blue-700 hover:underline"
              >
                Train Chart Times →
              </Link>
              <Link
                href="/tatkal-planner"
                className="text-blue-700 hover:underline"
              >
                Tatkal Clock &amp; Dates →
              </Link>
            </div>
          </section>

          {related.length > 0 && (
            <div className="mt-12 border-t border-slate-100 pt-8">
              <h2 className="mb-4 text-xl font-bold text-slate-900">
                {ui.related}
              </h2>
              <div className="flex flex-wrap gap-3">
                {related.map((r) => (
                  <Link
                    key={r.id}
                    href={canonicalFor(lang, r.id)}
                    className="rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100"
                  >
                    {r.term}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </article>

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
        />
      </div>
    );
  }

  // ---- Language index ----
  const terms = getAllGlossaryTermsForLang(lang);
  const grouped: Record<string, typeof terms> = {};
  for (const term of terms) {
    const letter = term.term[0].toUpperCase();
    (grouped[letter] ||= []).push(term);
  }
  const indexCanonical = `https://lastberth.com${canonicalFor(lang)}`;
  const indexJsonLd = {
    "@context": "https://schema.org",
    "@type": "DefinedTermSet",
    "@id": `${indexCanonical}#terms`,
    name: ui.title,
    description: ui.subtitle,
    url: indexCanonical,
    inLanguage: lang,
  };
  const indexBreadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: "https://lastberth.com/",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: ui.crumb,
        item: indexCanonical,
      },
    ],
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(indexJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(indexBreadcrumbJsonLd),
        }}
      />
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
          {ui.title}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
          {ui.subtitle}
        </p>
      </div>

      <div className="mb-10 flex justify-center">
        <GlossaryLanguageSelector
          currentLang={lang}
          languageLabel={ui.language}
        />
      </div>

      <div className="space-y-12">
        {Object.keys(grouped)
          .sort()
          .map((letter) => (
            <section key={letter} className="relative">
              <h2 className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 py-2 text-2xl font-bold text-blue-600 backdrop-blur">
                {letter}
              </h2>
              <div className="mt-6 grid gap-6 sm:grid-cols-2">
                {grouped[letter].map((item) => (
                  <Link
                    key={item.id}
                    href={canonicalFor(lang, item.id)}
                    className="block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <h3 className="font-bold text-slate-900">{item.term}</h3>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                      {item.definition}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          ))}
      </div>
    </div>
  );
}
