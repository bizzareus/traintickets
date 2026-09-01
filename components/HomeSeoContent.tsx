import Link from "next/link";
import type { HomeStrings } from "@/lib/home/home-langs";

/**
 * SEO content under the homepage search. Targets the highest-impression queries
 * from Search Console (current-availability timing, IRCTC monthly ticket limit,
 * app vs website for Tatkal, boarding-point change rules, WL/RAC meaning).
 * Driven by the localized homepage strings (`t.seo`), with FAQPage JSON-LD for
 * rich results. Internal links sit in a "See also" line so they stay consistent
 * across languages.
 */
export function HomeSeoContent({ t }: { t: HomeStrings["seo"] }) {
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: t.faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <section className="mx-auto max-w-3xl px-4 pb-16 sm:px-6 lg:max-w-4xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <div className="mt-4 border-t border-slate-200 pt-10">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">
          {t.heading}
        </h2>
        <p className="mt-2 max-w-2xl text-slate-600">{t.subtitle}</p>

        <div className="mt-8 space-y-8">
          {t.faqs.map((f) => (
            <article key={f.q}>
              <h3 className="text-lg font-semibold text-slate-900">{f.q}</h3>
              <p className="mt-2 text-slate-600">{f.a}</p>
            </article>
          ))}
        </div>

        <p className="mt-8 text-sm text-slate-600">
          {t.relatedIntro}{" "}
          <Link href="/chart-times" className="text-blue-600 hover:underline">
            {t.linkChartTimes}
          </Link>
          {", "}
          <Link href="/chart-vacancy" className="text-blue-600 hover:underline">
            {t.linkChartVacancy}
          </Link>
          {", "}
          <Link href="/glossary" className="text-blue-600 hover:underline">
            {t.linkGlossary}
          </Link>{" "}
          {t.glossaryLangsNote}
          {", "}
          <Link href="/pnr-status" className="text-blue-600 hover:underline">
            {t.linkPnr}
          </Link>
          {"."}
        </p>
      </div>
    </section>
  );
}
