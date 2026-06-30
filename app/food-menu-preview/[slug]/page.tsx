import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTrainFoodMenu } from "@/lib/trainFoodMenu";
import { FoodOrderingMenu } from "@/components/foodmenu/FoodOrderingMenu";

// Experimental UI preview — not for indexing.
export const metadata: Metadata = {
  title: "Food menu preview",
  robots: { index: false, follow: false },
};

export const dynamicParams = true;

export function generateStaticParams() {
  // Prebuild the test train; any other slug renders on demand.
  return [{ slug: "ndls-svdk-vande-bharat-express-22439" }];
}

type Props = { params: Promise<{ slug: string }> };

export default async function FoodMenuPreviewPage({ params }: Props) {
  const { slug } = await params;
  const menu = getTrainFoodMenu(slug);
  if (!menu || menu.classes.length === 0) notFound();
  return <FoodOrderingMenu menu={menu} />;
}
