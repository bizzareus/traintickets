import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTrainFoodMenu } from "@/lib/trainFoodMenu";
import { FoodOrderingMenu } from "@/components/foodmenu/FoodOrderingMenu";

export const dynamicParams = true;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const menu = getTrainFoodMenu(slug);
  if (!menu) {
    return { title: "Train Food Menu", robots: { index: false, follow: false } };
  }
  const nameWithRoute = menu.route
    ? `${menu.route} ${menu.trainName}`
    : menu.trainName;
  const prices = menu.classes
    .flatMap((c) => c.services.map((s) => s.price))
    .filter((p): p is number => typeof p === "number");
  const min = prices.length ? Math.min(...prices) : null;
  const title = `${nameWithRoute} - ${menu.trainNumber} Food Menu & Prices`;
  const description = `On-board food menu and IRCTC catering prices for ${nameWithRoute} (train ${menu.trainNumberPair}) on the ${menu.route} route${
    min != null ? `, starting at ₹${min}` : ""
  }. Breakfast, meals, snacks and beverages by class, inclusive of taxes.`;
  return {
    title,
    description,
    keywords: [
      `${menu.trainNumber} food menu`,
      `${menu.trainName} menu`,
      `${menu.trainName} catering charges`,
      `${menu.trainNumber} food price`,
      `irctc ${menu.trainNumber} menu`,
    ],
    // Preview UI: keep out of the index while it duplicates the live menu page.
    robots: { index: false, follow: true },
  };
}

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
