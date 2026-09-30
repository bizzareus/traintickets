import type { Metadata } from "next";
import { FESTIVALS_MAP } from "@/lib/specialTrains";
import { FestivalSpecialTrainsPage } from "@/components/special-trains/FestivalSpecialTrainsPage";

const cfg = FESTIVALS_MAP.diwali;

export const metadata: Metadata = {
  title: cfg.metaTitle,
  description: cfg.metaDescription,
  alternates: {
    canonical: cfg.canonicalPath,
  },
  openGraph: {
    title: cfg.metaTitle,
    description: cfg.metaDescription,
    url: cfg.canonicalPath,
    type: "website",
  },
};

export default function DiwaliSpecialTrainsRoute() {
  return <FestivalSpecialTrainsPage festivalKey="diwali" />;
}
