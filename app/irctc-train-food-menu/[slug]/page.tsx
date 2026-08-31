import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import {
  getTrainFoodMenu,
  listTrainFoodMenuSlugs,
  type TrainFoodMenu,
} from "@/lib/trainFoodMenu";
import { FoodOrderingMenu } from "@/components/foodmenu/FoodOrderingMenu";

export const dynamicParams = true;

export async function generateStaticParams() {
  return listTrainFoodMenuSlugs().map((slug) => ({ slug }));
}

type Props = { params: Promise<{ slug: string }> };

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://lastberth.com";

/** Service names in first-seen order across all classes (for the FAQ text). */
function serviceOrder(menu: TrainFoodMenu): string[] {
  const seen: string[] = [];
  for (const c of menu.classes) {
    for (const s of c.services) {
      if (!seen.includes(s.service)) seen.push(s.service);
    }
  }
  return seen;
}

function allPrices(menu: TrainFoodMenu): number[] {
  return menu.classes
    .flatMap((c) => c.services.map((s) => s.price))
    .filter((p): p is number => typeof p === "number");
}

function title(menu: TrainFoodMenu): string {
  return `${menu.trainName} Food Menu & Price: What's Included?`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const menu = getTrainFoodMenu(slug);
  if (!menu) {
    return {
      title: "Train Food Menu & Prices | IRCTC Catering",
      description:
        "IRCTC train catering menu and prices, organised by class and meal.",
      alternates: { canonical: `/irctc-train-food-menu/${slug}` },
    };
  }
  const prices = allPrices(menu);
  const min = prices.length ? Math.min(...prices) : null;
  const routePart = menu.route ? ` on the ${menu.route} route` : "";
  const description = `Official IRCTC food menu and prices for ${menu.trainName} (${menu.trainNumberPair})${routePart}. See every meal — breakfast, lunch/dinner, snacks and tea — by class (${menu.classes
    .map((c) => c.classCode)
    .join(", ")})${min != null ? `, starting at ₹${min}` : ""}. Catering charges inclusive of taxes.`;
  return {
    title: title(menu),
    description,
    keywords: [
      `${menu.trainNumber} food menu`,
      `${menu.trainNumber} menu`,
      `${menu.trainName} food menu`,
      `${menu.trainName} catering charges`,
      `${menu.trainNumber} breakfast price`,
      `${menu.trainNumber} lunch price`,
      `irctc ${menu.trainNumber} catering`,
      `${menu.trainNumber} food price`,
    ],
    alternates: { canonical: `/irctc-train-food-menu/${menu.slug}` },
    openGraph: { title: title(menu), description, type: "article" },
  };
}

export default async function TrainFoodMenuPage({ params }: Props) {
  const { slug } = await params;
  const menu = getTrainFoodMenu(slug);
  if (!menu || menu.classes.length === 0) notFound();

  if (menu.slug && slug !== menu.slug) {
    permanentRedirect(`/irctc-train-food-menu/${menu.slug}`);
  }

  const canonicalUrl = `${SITE_URL}/irctc-train-food-menu/${menu.slug}`;
  const services = serviceOrder(menu);
  const prices = allPrices(menu);
  const min = prices.length ? Math.min(...prices) : null;
  const max = prices.length ? Math.max(...prices) : null;

  // --- JSON-LD: Menu -> MenuSection (class) -> MenuSection (service, priced) -> MenuItem
  const menuJsonLd = {
    "@context": "https://schema.org",
    "@type": "Menu",
    name: `${menu.trainName} (${menu.trainNumberPair}) Food Menu`,
    url: canonicalUrl,
    hasMenuSection: menu.classes.map((c) => ({
      "@type": "MenuSection",
      name: `${c.className} (${c.classCode})`,
      hasMenuSection: c.services.map((s) => ({
        "@type": "MenuSection",
        name: s.service,
        ...(s.price != null
          ? {
              offers: {
                "@type": "Offer",
                price: s.price,
                priceCurrency: "INR",
              },
            }
          : {}),
        hasMenuItem: s.items.map((it) => ({
          "@type": "MenuItem",
          name: it.item,
          description: it.description,
        })),
      })),
    })),
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
      {
        "@type": "ListItem",
        position: 2,
        name: "Train Food Menu",
        item: `${SITE_URL}/irctc-train-food-menu`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: `${menu.trainName} (${menu.trainNumber})`,
        item: canonicalUrl,
      },
    ],
  };

  const breakfast = menu.classes[0]?.services.find((s) =>
    /breakfast/i.test(s.service),
  );
  const lunch = menu.classes[0]?.services.find((s) =>
    /lunch|dinner|meal/i.test(s.service),
  );
  const isPrebooked = /vande|tejas|rajdhani|shatabdi/i.test(menu.trainName);

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: `How much does food cost on ${menu.trainName} (${menu.trainNumber})?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `On ${menu.trainName} (${menu.trainNumberPair}), IRCTC catering charges${
            min != null && max != null
              ? ` range from ₹${min} to ₹${max} per item/meal (inclusive of taxes)`
              : " are listed per meal (inclusive of taxes)"
          }${
            breakfast?.price != null
              ? `. Breakfast is ₹${breakfast.price}`
              : ""
          }${
            lunch?.price != null ? ` and standard meals start from ₹${lunch.price}` : ""
          } in ${menu.classes[0]?.className} (${menu.classes[0]?.classCode}).`,
        },
      },
      {
        "@type": "Question",
        name: `Is food included in the ${menu.trainName} (${menu.trainNumber}) ticket fare?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: isPrebooked
            ? `For ${menu.trainName}, catering is typically pre-booked with the ticket at booking time. The rates shown here are the official IRCTC catering charges for each service (morning tea, breakfast, lunch/dinner, evening snacks), inclusive of GST.`
            : `For Mail and Express trains like ${menu.trainName}, catering is available on board from the pantry car or authorized e-catering vendors. Meals, snacks, tea, and packaged drinking water can be purchased during the journey at fixed IRCTC rates.`,
        },
      },
      {
        "@type": "Question",
        name: `What is on the menu of ${menu.trainName} (${menu.trainNumber})?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `The menu covers ${services
            .join(", ")
            .toLowerCase()} across ${menu.classes
            .map((c) => `${c.className} (${c.classCode})`)
            .join(" and ")}, featuring items such as ${(
            menu.classes[0]?.services
              .flatMap((s) => s.items.map((i) => i.item))
              .slice(0, 6) || []
          ).join(", ")}.`,
        },
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(menuJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <nav className="mb-4 text-sm text-slate-500" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-blue-700">
          Home
        </Link>
        <span className="mx-2">/</span>
        <Link href="/irctc-train-food-menu" className="hover:text-blue-700">
          Train Food Menu
        </Link>
        <span className="mx-2">/</span>
        <span className="text-slate-700">{menu.trainNumber}</span>
      </nav>

      {/* Food-ordering-style menu: hero (H1 + SEO summary), class toggle,
          dish search, and category sections with dish cards + food tiles. */}
      <FoodOrderingMenu menu={menu} />

      {menu.notes.length > 0 && (
        <section className="mb-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-2 text-base font-bold text-slate-900">
            Catering notes &amp; guidelines
          </h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
            {menu.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-sm text-slate-500">
        Source:{" "}
        <a
          href={menu.sourcePdfUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="font-medium text-blue-700 hover:underline"
        >
          official IRCTC catering tariff
        </a>
        . Menus are served on a cyclic basis and tariffs are set by Indian Railways. See also{" "}
        <Link
          href="/irctc-train-food-menu"
          className="font-medium text-blue-700 hover:underline"
        >
          all train food menus
        </Link>{" "}
        or the{" "}
        <Link
          href={`/chart-times/${menu.trainNumber}`}
          className="font-medium text-blue-700 hover:underline"
        >
          {menu.trainNumber} chart preparation times
        </Link>
        .
      </p>
    </>
  );
}
