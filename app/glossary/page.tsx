import { Metadata } from "next";
import Link from "next/link";
import {
  getAllGlossaryTermsForLang,
  GLOSSARY_LANGS,
} from "@/lib/seo/glossary-db";
import { glossaryUi } from "@/lib/seo/glossary-ui";
import { GlossaryLanguageSelector } from "@/components/glossary/GlossaryLanguageSelector";

const ui = glossaryUi("en");

export const metadata: Metadata = {
  title: "Indian Railway Booking Glossary & Terms Dictionary | LastBerth",
  description:
    "Decode Indian Railway booking jargon in plain English: RLWL, PQWL, GNWL, RAC, CNF, Tatkal, chart preparation, current availability, class codes and more.",
  alternates: {
    canonical: "/glossary",
    languages: Object.fromEntries([
      ...GLOSSARY_LANGS.map((l) => [l, l === "en" ? "/glossary" : `/glossary/${l}`]),
      ["x-default", "/glossary"],
    ]),
  },
};

export default function GlossaryIndexPage() {
  const terms = getAllGlossaryTermsForLang("en");

  const grouped: Record<string, typeof terms> = {};
  for (const term of terms) {
    const letter = term.term[0].toUpperCase();
    if (!grouped[letter]) grouped[letter] = [];
    grouped[letter].push(term);
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
        <GlossaryLanguageSelector currentLang="en" languageLabel={ui.language} />
      </div>

      <div className="space-y-12">
        {Object.keys(grouped).sort().map((letter) => (
          <section key={letter} className="relative">
            <h2 className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 py-2 text-2xl font-bold text-blue-600 backdrop-blur">
              {letter}
            </h2>
            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              {grouped[letter].map((item) => (
                <Link
                  key={item.id}
                  href={`/glossary/${item.id}`}
                  className="group block rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:border-blue-200 hover:shadow-md"
                >
                  <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-600">
                    {item.term}
                  </h3>
                  <p className="mt-2 line-clamp-2 text-sm text-slate-600">
                    {item.definition}
                  </p>
                  <div className="mt-4 text-sm font-semibold text-blue-600 group-hover:underline">
                    Read Definition →
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
