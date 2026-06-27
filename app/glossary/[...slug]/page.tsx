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
function parseSlug(
  slug: string[],
): { lang: string; termId?: string } | null {
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
    return {
      title: `What is ${item.term}? | Indian Railway Glossary`,
      description: `Meaning of ${item.term} in Indian Railway bookings. ${item.definition.slice(0, 110)}`,
      alternates: {
        canonical: canonicalFor(lang, termId),
        languages: hreflangAlternates(termId),
      },
    };
  }

  const ui = glossaryUi(lang);
  return {
    title: `${ui.title} | LastBerth`,
    description: ui.subtitle,
    alternates: {
      canonical: canonicalFor(lang),
      languages: hreflangAlternates(),
    },
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
      .filter(Boolean) as typeof item[];

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
          <nav className="flex text-sm text-slate-500">
            <Link href={canonicalFor(lang)} className="hover:text-blue-600 hover:underline">
              {ui.crumb}
            </Link>
            <span className="mx-2">/</span>
            <span className="text-slate-900">{item.term}</span>
          </nav>
          <GlossaryLanguageSelector currentLang={lang} termId={termId} languageLabel={ui.language} />
        </div>

        <article className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            {item.term}
          </h1>
          <div className="mt-8 prose prose-slate prose-lg max-w-none">
            <p className="lead text-xl text-slate-700 font-medium">{item.definition}</p>
          </div>

          {related.length > 0 && (
            <div className="mt-12 border-t border-slate-100 pt-8">
              <h2 className="mb-4 text-xl font-bold text-slate-900">{ui.related}</h2>
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

        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
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

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
          {ui.title}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">{ui.subtitle}</p>
      </div>

      <div className="mb-10 flex justify-center">
        <GlossaryLanguageSelector currentLang={lang} languageLabel={ui.language} />
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
                    <p className="mt-1 line-clamp-2 text-sm text-slate-600">{item.definition}</p>
                  </Link>
                ))}
              </div>
            </section>
          ))}
      </div>
    </div>
  );
}
