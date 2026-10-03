"use client";

import { usePostHog } from "@posthog/react";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { isBrowserOnLocalhost } from "@/lib/observability";

function PostHogPageViewInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const posthog = usePostHog();

  useEffect(() => {
    if (!pathname || !posthog || typeof window === "undefined") return;

    const isAdminPath = pathname.startsWith("/admin");
    const isAdminUser = window.localStorage.getItem("admin") === "true";
    if (isAdminPath || isAdminUser) return;

    try {
      if (pathname.startsWith("/blog")) {
        if (posthog.sessionRecordingStarted?.()) {
          posthog.stopSessionRecording();
        }
      } else if (!isBrowserOnLocalhost()) {
        if (!posthog.sessionRecordingStarted?.()) {
          posthog.startSessionRecording();
        }
      }
    } catch {
      /* avoid breaking if replay methods fail */
    }

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
