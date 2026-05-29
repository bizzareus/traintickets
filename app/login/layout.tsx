import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Access your LastBerth train monitoring dashboard to track confirmed train tickets and seat availability.",
  alternates: {
    canonical: "/login",
  },
};

export default function LoginLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
