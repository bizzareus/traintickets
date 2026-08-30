"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminShortLinksRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin/analytics?tab=short-links");
  }, [router]);

  return (
    <div className="flex h-64 items-center justify-center">
      <div className="flex flex-col items-center gap-2">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />
        <p className="text-xs text-slate-500">Redirecting to Analytics & Short Links...</p>
      </div>
    </div>
  );
}
