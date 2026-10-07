import { ShieldCheck, Users, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface HomeTrustStripProps {
  className?: string;
  irctcAgentText?: string;
  trustedByText?: string;
  jugaadText?: string;
}

/**
 * Trust indicator strip displayed directly below the main search bar.
 * Aligns with LastBerth's design language: crisp typography, subtle slate/emerald/amber accents,
 * and responsive horizontal layout.
 */
export function HomeTrustStrip({
  className,
  irctcAgentText = "Registered IRCTC Agent",
  trustedByText = "Trusted by 50K+ Travellers",
  jugaadText = "Train travel jugaad",
}: HomeTrustStripProps) {
  return (
    <div
      className={cn(
        "mt-3 sm:mt-3.5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-xl border border-slate-200/80 bg-white/70 px-4 py-2.5 text-xs text-slate-600 shadow-2xs backdrop-blur-xs sm:gap-x-6 sm:text-sm",
        className,
      )}
      aria-label="Platform trust credentials"
    >
      <div className="inline-flex items-center gap-1.5 font-medium text-slate-700">
        <ShieldCheck
          className="h-4 w-4 shrink-0 text-emerald-600"
          aria-hidden="true"
        />
        <span>{irctcAgentText}</span>
      </div>
      <span
        className="hidden select-none text-slate-300 sm:inline"
        aria-hidden="true"
      >
        |
      </span>
      <div className="inline-flex items-center gap-1.5 font-medium text-slate-700">
        <Users
          className="h-4 w-4 shrink-0 text-blue-600"
          aria-hidden="true"
        />
        <span>{trustedByText}</span>
      </div>
      <span
        className="hidden select-none text-slate-300 sm:inline"
        aria-hidden="true"
      >
        |
      </span>
      <div className="inline-flex items-center gap-1.5 font-medium text-slate-700">
        <Sparkles
          className="h-4 w-4 shrink-0 text-amber-500"
          aria-hidden="true"
        />
        <span>{jugaadText}</span>
      </div>
    </div>
  );
}
