"use client";

import { useRouter } from "next/navigation";
import { HOME_LANGS, getLanguageName } from "@/lib/home/home-langs";

/**
 * Small borderless language dropdown shown next to the logo on the homepage.
 * Selecting a language navigates to that locale (English at `/`, others at
 * `/<lang>`). Native <select> for accessibility; no border/background.
 */
export function HomeLanguageDropdown({ currentLang }: { currentLang: string }) {
  const router = useRouter();
  return (
    <select
      value={currentLang}
      onChange={(e) => {
        const l = e.target.value;
        router.push(l === "en" ? "/" : `/${l}`);
      }}
      aria-label="Choose language"
      className="cursor-pointer rounded-md border-0 bg-transparent py-1 pl-1 pr-5 text-sm font-medium text-slate-500 hover:text-slate-800 focus:outline-none focus:ring-0"
    >
      {HOME_LANGS.map((l) => (
        <option key={l} value={l}>
          {getLanguageName(l)}
        </option>
      ))}
    </select>
  );
}
