"use client";

import { usePostHog } from "@posthog/react";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

function PostHogPageViewInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const posthog = usePostHog();

  useEffect(() => {
    if (!pathname || !posthog || typeof window === "undefined") return;
    if (pathname.startsWith("/admin")) return;
    try {
      posthog.capture("$pageview", {
        $current_url: window.location.href,
      });
    } catch {
      /* avoid breaking the tree if capture fails mid-init */
    }
  }, [pathname, searchParams, posthog]);

  return null;
}

export function PostHogPageView() {
  return (
    <Suspense fallback={null}>
      <PostHogPageViewInner />
    </Suspense>
  );
}
