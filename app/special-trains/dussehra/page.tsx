import type { Metadata } from "next";
import { FESTIVALS_MAP } from "@/lib/specialTrains";
import { FestivalSpecialTrainsPage } from "@/components/special-trains/FestivalSpecialTrainsPage";
import { buildOpenGraph } from "@/lib/seo/metadata";

const cfg = FESTIVALS_MAP.dusshera;

export const metadata: Metadata = {
  title: cfg.metaTitle,
  description: cfg.metaDescription,
  alternates: {
    canonical: cfg.canonicalPath,
  },
  openGraph: buildOpenGraph({
    title: `${cfg.metaTitle} | LastBerth`,
    description: cfg.metaDescription,
    url: cfg.canonicalPath,
  }),
};

export default function DussehraSpecialTrainsRoute() {
  return <FestivalSpecialTrainsPage festivalKey="dusshera" />;
}
