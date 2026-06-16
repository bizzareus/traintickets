"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function LanguagePromptSheet({
  suggestedLang,
  currentSlug,
  langName,
}: {
  suggestedLang: string;
  currentSlug: string;
  langName: string;
}) {
  const router = useRouter();
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Only show if not dismissed before
    const dismissed = localStorage.getItem("blog_lang_prompt_dismissed");
    if (!dismissed) {
      // Small delay for better UX
      const timer = setTimeout(() => setShow(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleDismiss = () => {
    localStorage.setItem("blog_lang_prompt_dismissed", "true");
    setShow(false);
  };

  const handleSwitch = () => {
    localStorage.setItem("blog_lang_prompt_dismissed", "true");
    router.push(`/blog/${suggestedLang}/${currentSlug}`);
  };

  if (!show) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-900/40 z-[100] md:hidden backdrop-blur-sm transition-opacity animate-in fade-in duration-300" 
        onClick={handleDismiss}
      />
      
      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-[101] md:hidden bg-white rounded-t-3xl shadow-2xl p-6 pt-7 pb-8 border-t border-slate-200 animate-in slide-in-from-bottom duration-300">
        <div className="flex justify-between items-start mb-4">
          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
            </svg>
          </div>
          <button onClick={handleDismiss} className="p-2 -mt-2 -mr-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <h3 className="text-xl font-bold text-slate-900 mb-2">
          Read in {langName}?
        </h3>
        <p className="text-[15px] text-slate-600 mb-7 leading-relaxed">
          We noticed you might prefer reading this article in {langName}. Would you like to switch?
        </p>
        
        <div className="flex flex-col gap-3">
          <button 
            onClick={handleSwitch}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-4 rounded-xl transition-colors shadow-sm text-[15px]"
          >
            Switch to {langName}
          </button>
          <button 
            onClick={handleDismiss}
            className="w-full bg-white text-slate-700 font-semibold py-4 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors text-[15px]"
          >
            Continue in English
          </button>
        </div>
      </div>
    </>
  );
}
