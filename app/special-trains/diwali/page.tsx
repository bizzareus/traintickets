import type { Metadata } from "next";
import { FESTIVALS_MAP } from "@/lib/specialTrains";
import { FestivalSpecialTrainsPage } from "@/components/special-trains/FestivalSpecialTrainsPage";
import { buildPageMetadata } from "@/lib/seo/metadata";

const cfg = FESTIVALS_MAP.diwali;

export const metadata: Metadata = buildPageMetadata({
  title: cfg.metaTitle,
  description: cfg.metaDescription,
  canonical: cfg.canonicalPath,
});

export default function DiwaliSpecialTrainsRoute() {
  return <FestivalSpecialTrainsPage festivalKey="diwali" />;
}
