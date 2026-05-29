import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Register",
  description: "Create a LastBerth account to set up instant notifications and alerts for confirmed train tickets.",
  alternates: {
    canonical: "/register",
  },
};

export default function RegisterLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
