import type { Metadata } from "next";
import { StandardMenuPage } from "@/components/foodmenu/StandardMenuPage";
import { standardMenuMetadata } from "@/lib/standardMenu";

const SLUG = "rajdhani-1ac-executive";

export function generateMetadata(): Metadata {
  return standardMenuMetadata(SLUG);
}

export default function Page() {
  return <StandardMenuPage slug={SLUG} />;
}
