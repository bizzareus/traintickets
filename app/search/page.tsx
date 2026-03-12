"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SearchRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/");
  }, [router]);
  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <p className="text-slate-500">Redirecting…</p>
    </div>
  );
}
