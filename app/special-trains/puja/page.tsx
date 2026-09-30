import type { Metadata } from "next";
import { FESTIVALS_MAP } from "@/lib/specialTrains";
import { FestivalSpecialTrainsPage } from "@/components/special-trains/FestivalSpecialTrainsPage";

const cfg = FESTIVALS_MAP.puja;

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

export default function PujaSpecialTrainsRoute() {
  return <FestivalSpecialTrainsPage festivalKey="puja" />;
}
