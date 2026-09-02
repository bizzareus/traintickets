"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, Bell, Link2 } from "lucide-react";
import AdminLockButton from "./AdminLockButton";

function AdminNavContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isAnalytics = pathname?.startsWith("/admin/analytics") || pathname?.startsWith("/admin/short-links");
  const currentTab = searchParams?.get("tab") || "notifications";

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <nav className="flex flex-wrap items-center gap-4">
      {/* Analytics Dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setDropdownOpen((prev) => !prev)}
          className={`inline-flex items-center gap-1.5 text-sm font-medium transition ${
            isAnalytics ? "text-indigo-600 font-semibold" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <span>Analytics</span>
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform duration-150 ${
              dropdownOpen ? "rotate-180 text-indigo-600" : "text-slate-400"
            }`}
          />
        </button>

        {dropdownOpen && (
          <div className="absolute left-0 top-full z-50 mt-2 w-52 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl transition">
            <Link
              href="/admin/analytics?tab=notifications"
              onClick={() => setDropdownOpen(false)}
              className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-semibold transition ${
                isAnalytics && currentTab !== "short-links"
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100/70 text-indigo-600">
                <Bell className="h-4 w-4" />
              </div>
              <div className="flex flex-col">
                <span>Notifications</span>
                <span className="text-[10px] font-normal text-slate-400">Delivery & user alerts</span>
              </div>
            </Link>

            <Link
              href="/admin/analytics?tab=short-links"
              onClick={() => setDropdownOpen(false)}
              className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-semibold transition ${
                isAnalytics && currentTab === "short-links"
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100/70 text-emerald-600">
                <Link2 className="h-4 w-4" />
              </div>
              <div className="flex flex-col">
                <span>Short Links</span>
                <span className="text-[10px] font-normal text-slate-400">Day-on-Day & clicks</span>
              </div>
            </Link>
          </div>
        )}
      </div>

      <Link
        href="/admin/alerts"
        className={`text-sm font-medium transition ${
          pathname === "/admin/alerts" ? "text-indigo-600 font-semibold" : "text-slate-600 hover:text-slate-900"
        }`}
      >
        Alerts
      </Link>
      <Link
        href="/admin/chart-time-ingestion"
        className={`text-sm font-medium transition ${
          pathname === "/admin/chart-time-ingestion" ? "text-indigo-600 font-semibold" : "text-slate-600 hover:text-slate-900"
        }`}
      >
        Chart-time ingestion
      </Link>
      <Link
        href="/admin/reddit-gtm"
        className={`text-sm font-medium transition ${
          pathname === "/admin/reddit-gtm" ? "text-indigo-600 font-semibold" : "text-slate-600 hover:text-slate-900"
        }`}
      >
        Reddit GTM
      </Link>
      <Link
        href="/admin/best-seats-cron"
        className={`text-sm font-medium transition ${
          pathname === "/admin/best-seats-cron" ? "text-indigo-600 font-semibold" : "text-slate-600 hover:text-slate-900"
        }`}
      >
        Best-seats cron
      </Link>
      <Link
        href="/admin/unsubscribes"
        className={`text-sm font-medium transition ${
          pathname === "/admin/unsubscribes" ? "text-indigo-600 font-semibold" : "text-slate-600 hover:text-slate-900"
        }`}
      >
        Unsubscribes
      </Link>
      <AdminLockButton />
    </nav>
  );
}

export default function AdminNav() {
  return (
    <Suspense fallback={<nav className="flex items-center gap-4 text-sm text-slate-600">Loading...</nav>}>
      <AdminNavContent />
    </Suspense>
  );
}
