import type { Metadata } from "next";
import { StandardMenuPage } from "@/components/foodmenu/StandardMenuPage";
import { standardMenuMetadata } from "@/lib/standardMenu";

const SLUG = "duronto-ac-3tier-food-menu-prices";

export function generateMetadata(): Metadata {
  return standardMenuMetadata(SLUG);
}

export default function Page() {
  return <StandardMenuPage slug={SLUG} />;
}
