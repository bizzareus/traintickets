import type { ReactNode } from "react";
import type { Metadata } from "next";

// Transactional notification-management flow (recipient + token in the URL).
// No search value, and the query-string tokens shouldn't surface in indexed URLs.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function UnsubscribeLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
