import type { Metadata } from "next";
import { HomeClient } from "@/components/home/HomeClient";
import { getHomeStrings, homeHreflang } from "@/lib/home/home-i18n";

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
    languages: homeHreflang(),
  },
};

export default function HomePage() {
  return <HomeClient lang="en" t={getHomeStrings("en")} />;
}
