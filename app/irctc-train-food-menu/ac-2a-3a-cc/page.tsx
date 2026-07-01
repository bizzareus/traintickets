import type { Metadata } from "next";
import { StandardMenuPage } from "@/components/foodmenu/StandardMenuPage";
import { standardMenuMetadata } from "@/lib/standardMenu";

const SLUG = "ac-2a-3a-cc";

export function generateMetadata(): Metadata {
  return standardMenuMetadata(SLUG);
}

export default function Page() {
  return <StandardMenuPage slug={SLUG} />;
}
