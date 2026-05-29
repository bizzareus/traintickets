import type { ReactNode } from "react";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
  },
};

export default function MainHomeLayout({ children }: { children: ReactNode }) {
  return children;
}
