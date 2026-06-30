import Link from "next/link";
import { HOME_LANGS, getLanguageName } from "@/lib/home/home-langs";

/**
 * Language switcher for the homepage. English lives at `/`; other languages at
 * `/<lang>`. Mirrors the glossary selector so the two read the same way.
 */
export function HomeLanguageSelector({
  currentLang,
  languageLabel,
}: {
  currentLang: string;
  languageLabel: string;
}) {
  const hrefFor = (lang: string) => (lang === "en" ? "/" : `/${lang}`);

  return (
    <nav
      aria-label="Homepage language"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
    >
      <span className="font-medium text-slate-500">{languageLabel}</span>
      {HOME_LANGS.map((lang) => {
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
