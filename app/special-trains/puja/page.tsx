import type { Metadata } from "next";
import { FESTIVALS_MAP } from "@/lib/specialTrains";
import { FestivalSpecialTrainsPage } from "@/components/special-trains/FestivalSpecialTrainsPage";
import { buildPageMetadata } from "@/lib/seo/metadata";

const cfg = FESTIVALS_MAP.puja;

export const metadata: Metadata = buildPageMetadata({
  title: cfg.metaTitle,
  description: cfg.metaDescription,
  canonical: cfg.canonicalPath,
});

export default function PujaSpecialTrainsRoute() {
  return <FestivalSpecialTrainsPage festivalKey="puja" />;
}
