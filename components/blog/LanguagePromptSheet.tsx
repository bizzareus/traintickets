"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { mapStateToLanguage, getLanguageName } from "@/lib/blog-translations";

export function LanguagePromptSheet({
  currentSlug,
  currentLang,
  availableLangs,
}: {
  currentSlug: string;
  currentLang: string;
  availableLangs: string[];
}) {
  const router = useRouter();
  const [targetLang, setTargetLang] = useState<string | null>(null);

  useEffect(() => {
    // Only offer language switch when viewing the English article and translations exist
    if (currentLang !== "en" || availableLangs.length <= 1) return;

    // Only show if not dismissed before
    const dismissed = localStorage.getItem("blog_lang_prompt_dismissed");
    if (dismissed) return;

    // Detect preference from URL parameter or navigator.languages
    const searchParams = new URLSearchParams(window.location.search);
    const regionParam = searchParams.get("region") || "";
    const langFromRegion = regionParam ? mapStateToLanguage(regionParam) : null;

    let matched: string | null = null;
    if (langFromRegion && availableLangs.includes(langFromRegion)) {
      matched = langFromRegion;
    } else if (typeof navigator !== "undefined" && navigator.languages) {
      for (const userLang of navigator.languages) {
        const primary = userLang.toLowerCase().split("-")[0];
        if (primary !== "en" && availableLangs.includes(primary)) {
          matched = primary;
          break;
        }
      }
    }

    if (matched) {
      setTargetLang(matched);
    }
  }, [currentLang, availableLangs]);

  const handleDismiss = () => {
    localStorage.setItem("blog_lang_prompt_dismissed", "true");
    setTargetLang(null);
  };

  const handleSwitch = () => {
    if (!targetLang) return;
    localStorage.setItem("blog_lang_prompt_dismissed", "true");
    router.push(`/blog/${targetLang}/${currentSlug}`);
  };

  if (!targetLang) return null;
  const langName = getLanguageName(targetLang);

  return (
    <>
      {/* Backdrop */}
      <div
        className="animate-in fade-in fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300 md:hidden"
        onClick={handleDismiss}
      />

      {/* Sheet */}
      <div className="animate-in slide-in-from-bottom fixed bottom-0 left-0 right-0 z-[101] rounded-t-3xl border-t border-slate-200 bg-white p-6 pb-8 pt-7 shadow-2xl duration-300 md:hidden">
        <div className="mb-4 flex items-start justify-between">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-100">
            <svg
              className="h-6 w-6 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
              />
            </svg>
          </div>
          <button
            onClick={handleDismiss}
            className="-mr-2 -mt-2 rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <h3 className="mb-2 text-xl font-bold text-slate-900">
          Read in {langName}?
        </h3>
        <p className="mb-7 text-[15px] leading-relaxed text-slate-600">
          We noticed you might prefer reading this article in {langName}. Would
          you like to switch?
        </p>

        <div className="flex flex-col gap-3">
          <button
            onClick={handleSwitch}
            className="w-full rounded-xl bg-blue-600 px-4 py-4 text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            Switch to {langName}
          </button>
          <button
            onClick={handleDismiss}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-4 text-[15px] font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            Continue in English
          </button>
        </div>
      </div>
    </>
  );
}
