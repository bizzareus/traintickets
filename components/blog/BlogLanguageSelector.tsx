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

export function BlogLanguageSelector({
  availableLangs,
  currentLang,
  currentSlug,
}: {
  availableLangs: string[];
  currentLang: string;
  currentSlug: string;
}) {
  const router = useRouter();

  if (availableLangs.length <= 1) {
    return null;
  }

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLang = e.target.value;
    if (newLang === "en") {
      router.push(`/blog/${currentSlug}`);
    } else {
      router.push(`/blog/${newLang}/${currentSlug}`);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="blog-language" className="text-sm font-semibold text-slate-600">
        Language:
      </label>
      <select
        id="blog-language"
        value={currentLang}
        onChange={handleLanguageChange}
        className="block rounded-lg border-slate-200 bg-slate-50 py-1.5 pl-3 pr-8 text-sm text-slate-700 focus:border-blue-500 focus:ring-blue-500 transition-colors shadow-sm cursor-pointer"
      >
        {availableLangs.map((lang) => (
          <option key={lang} value={lang}>
            {getLanguageName(lang)}
          </option>
        ))}
      </select>
    </div>
  );
}
