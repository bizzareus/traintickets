"use client";

import { useRouter } from "next/navigation";

const getLanguageName = (langCode: string): string => {
  switch (langCode) {
    case "mr": return "Marathi";
    case "hi": return "Hindi";
    case "bn": return "Bengali";
    case "ta": return "Tamil";
    case "te": return "Telugu";
    case "ml": return "Malayalam";
    default: return "English";
  }
};

const ALL_LANGS = ["en", "mr", "hi", "bn", "ta", "te", "ml"];

export function BlogIndexLanguageSelector({ currentLang }: { currentLang: string }) {
  const router = useRouter();

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === "en") {
      router.push("/blog");
    } else {
      router.push(`/blog?lang=${val}`);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="blog-index-language" className="text-sm font-semibold text-slate-600">
        Language:
      </label>
      <select
        id="blog-index-language"
        value={currentLang}
        onChange={handleLanguageChange}
        className="block rounded-lg border-slate-200 bg-slate-50 py-1.5 pl-3 pr-8 text-sm text-slate-700 focus:border-blue-500 focus:ring-blue-500 transition-colors shadow-sm cursor-pointer"
      >
        {ALL_LANGS.map((lang) => (
          <option key={lang} value={lang}>
            {getLanguageName(lang)}
          </option>
        ))}
      </select>
    </div>
  );
}
