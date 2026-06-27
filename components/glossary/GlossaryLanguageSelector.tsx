import Link from "next/link";
import { GLOSSARY_LANGS, getLanguageName } from "@/lib/seo/glossary-db";

/**
 * Language switcher for glossary pages. Builds the right URL per language for
 * either the index (no termId) or a specific term. English lives at the
 * un-prefixed path; other languages at /glossary/<lang>[/<term>].
 */
export function GlossaryLanguageSelector({
  currentLang,
  termId,
  languageLabel,
}: {
  currentLang: string;
  termId?: string;
  languageLabel: string;
}) {
  const hrefFor = (lang: string) => {
    if (lang === "en") return termId ? `/glossary/${termId}` : "/glossary";
    return termId ? `/glossary/${lang}/${termId}` : `/glossary/${lang}`;
  };

  return (
    <nav
      aria-label="Glossary language"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
    >
      <span className="font-medium text-slate-500">{languageLabel}</span>
      {GLOSSARY_LANGS.map((lang) => {
        const active = lang === currentLang;
        return (
          <Link
            key={lang}
            href={hrefFor(lang)}
            hrefLang={lang}
            aria-current={active ? "true" : undefined}
            className={
              active
                ? "font-semibold text-blue-700 underline"
                : "text-slate-600 hover:text-blue-600"
            }
          >
            {getLanguageName(lang)}
          </Link>
        );
      })}
    </nav>
  );
}
