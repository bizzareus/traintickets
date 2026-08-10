import type { Metadata } from "next";
import { StandardMenuPage } from "@/components/foodmenu/StandardMenuPage";
import { standardMenuMetadata } from "@/lib/standardMenu";

const SLUG = "west-zone-duronto-sleeper-food-menu";

export function generateMetadata(): Metadata {
  return standardMenuMetadata(SLUG);
}

export default function Page() {
  return <StandardMenuPage slug={SLUG} />;
}
