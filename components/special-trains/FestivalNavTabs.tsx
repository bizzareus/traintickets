import Link from "next/link";
import { Sparkles } from "lucide-react";

type Props = {
  currentKey?: "all" | "diwali" | "chhath" | "dusshera" | "puja";
};

const TABS = [
  { key: "all", href: "/special-trains", label: "All Specials", icon: "🚆" },
  {
    key: "diwali",
    href: "/special-trains/diwali",
    label: "Diwali Specials",
    icon: "🪔",
  },
  {
    key: "chhath",
    href: "/special-trains/chhath",
    label: "Chhath Specials",
    icon: "🌅",
  },
  {
    key: "dusshera",
    href: "/special-trains/dusshera",
    label: "Dusshera Specials",
    icon: "🏹",
  },
  {
    key: "puja",
    href: "/special-trains/puja",
    label: "Puja Specials",
    icon: "🌺",
  },
] as const;

export function FestivalNavTabs({ currentKey = "all" }: Props) {
  return (
    <nav
      className="scrollbar-none -mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0"
      aria-label="Festival Specials navigation"
    >
      {TABS.map((tab) => {
        const isActive = currentKey === tab.key;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all sm:text-sm ${
              isActive
                ? "shadow-xs bg-slate-900 text-white"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
            {isActive && tab.key !== "all" && (
              <Sparkles className="h-3 w-3 text-amber-400" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
