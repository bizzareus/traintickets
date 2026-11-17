import type { ReactNode } from "react";
import type { Metadata } from "next";

// Legacy copy of the homepage booking tool kept live for bookmarked users.
// The current tool lives at "/", so keep this out of the index to avoid
// duplicate-content indexing. follow stays on so its links remain crawlable.
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default function V1Layout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
