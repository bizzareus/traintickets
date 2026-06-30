import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getTrainFoodMenu,
  listTrainFoodMenuSlugs,
  type TrainFoodMenu,
} from "@/lib/trainFoodMenu";
import { MenuClassesSearch } from "./MenuClassesSearch";

export const dynamicParams = false;

export async function generateStaticParams() {
  return listTrainFoodMenuSlugs().map((slug) => ({ slug }));
}

type Props = { params: Promise<{ slug: string }> };

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://lastberth.com";

function inr(n: number | null): string {
  return n == null ? "—" : `₹${n}`;
}

/** Services in first-seen order across all classes (rows of the price grid). */
function serviceOrder(menu: TrainFoodMenu): string[] {
  const seen: string[] = [];
  for (const c of menu.classes) {
    for (const s of c.services) {
      if (!seen.includes(s.service)) seen.push(s.service);
    }
  }
  return seen;
}

function priceFor(
  menu: TrainFoodMenu,
  classCode: string,
  service: string,
): number | null {
  const cls = menu.classes.find((c) => c.classCode === classCode);
  const svc = cls?.services.find((s) => s.service === service);
  return svc?.price ?? null;
}

function allPrices(menu: TrainFoodMenu): number[] {
  return menu.classes
    .flatMap((c) => c.services.map((s) => s.price))
    .filter((p): p is number => typeof p === "number");
}

function title(menu: TrainFoodMenu): string {
  return `${menu.trainName} (${menu.trainNumberPair}) Food Menu & Prices | IRCTC Catering | LastBerth`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const menu = getTrainFoodMenu(slug);
  if (!menu) {
    return {
      title: "Train Food Menu & Prices | IRCTC Catering | LastBerth",
      description:
        "IRCTC train catering menu and prices, organised by class and meal.",
      alternates: { canonical: `/irctc-train-food-menu/${slug}` },
    };
  }
  const prices = allPrices(menu);
  const min = prices.length ? Math.min(...prices) : null;
  const description = `IRCTC food menu and prices for ${menu.trainName} (${menu.trainNumberPair}) on the ${menu.route} route. See every meal — morning tea, breakfast, lunch/dinner and snacks — by class (${menu.classes
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
      `vande bharat ${menu.trainNumber} food`,
    ],
    alternates: { canonical: `/irctc-train-food-menu/${menu.slug}` },
    openGraph: { title: title(menu), description, type: "article" },
  };
}

export default async function TrainFoodMenuPage({ params }: Props) {
  const { slug } = await params;
  const menu = getTrainFoodMenu(slug);
  if (!menu || menu.classes.length === 0) notFound();

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
    /lunch|dinner/i.test(s.service),
  );
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
              ? ` range from ₹${min} to ₹${max} per meal (inclusive of taxes)`
              : " are listed per meal (inclusive of taxes)"
          }${
            breakfast?.price != null
              ? `. Breakfast is ₹${breakfast.price}`
              : ""
          }${
            lunch?.price != null ? ` and lunch/dinner is ₹${lunch.price}` : ""
          } in ${menu.classes[0]?.className} (${menu.classes[0]?.classCode}).`,
        },
      },
      {
        "@type": "Question",
        name: `Is food included in the ${menu.trainName} (${menu.trainNumber}) ticket?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `For most Vande Bharat services, catering is pre-booked with the ticket at the time of booking. The prices shown here are the IRCTC catering charges for each meal (morning tea, breakfast, lunch/dinner and snacks), inclusive of taxes.`,
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
            .join(" and ")}, with items such as ${(
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

      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
          {menu.trainName} ({menu.trainNumberPair}) Food Menu &amp; Prices
        </h1>
        <p className="mt-2 text-slate-600">
          IRCTC catering menu and per-meal prices for{" "}
          <span className="font-medium">{menu.trainName}</span> on the{" "}
          <span className="font-medium">{menu.route}</span> route, organised by
          class and meal. Prices are inclusive of taxes.
        </p>
      </header>

      {/* Prices at a glance — card list (one row per meal, price chip per
          class). No table: stacks on mobile, meal-left / chips-right on desktop. */}
      <section className="mb-8" aria-label="Prices at a glance">
        <h2 className="mb-3 text-base font-bold text-slate-900">
          Prices at a glance
        </h2>
        <ul className="space-y-3">
          {services.map((svc) => (
            <li
              key={svc}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex sm:items-center sm:justify-between sm:gap-6"
            >
              <div className="mb-2.5 font-semibold text-slate-800 sm:mb-0">
                {svc}
              </div>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                {menu.classes.map((c) => (
                  <span
                    key={c.classCode}
                    className="flex-1 rounded-lg bg-slate-50 px-3 py-2 sm:flex-none sm:min-w-[9rem]"
                  >
                    <span className="block text-xs text-slate-500">
                      {c.className} ({c.classCode})
                    </span>
                    <span className="text-lg font-bold text-slate-900">
                      {inr(priceFor(menu, c.classCode, svc))}
                    </span>
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Per-class detailed menu, with client-side dish/meal search */}
      <MenuClassesSearch classes={menu.classes} />

      {menu.notes.length > 0 && (
        <section className="mb-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-2 text-base font-bold text-slate-900">
            Catering notes
          </h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
            {menu.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-sm text-slate-500">
        Source: official IRCTC menu (
        <a
          href={menu.sourcePdfUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="font-medium text-blue-700 hover:underline"
        >
          PDF
        </a>
        ). Menus are served on a cyclic basis and may change. See also{" "}
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
