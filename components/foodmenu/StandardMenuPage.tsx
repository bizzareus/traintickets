import Link from "next/link";
import { notFound } from "next/navigation";
import {
  STANDARD_MENU_PAGES,
  getStandardMenuGroup,
} from "@/lib/standardMenu";
import { StandardMenuView } from "@/components/foodmenu/StandardMenuView";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://lastberth.com";

export function StandardMenuPage({ slug }: { slug: string }) {
  const cfg = STANDARD_MENU_PAGES.find((p) => p.slug === slug);
  const group = getStandardMenuGroup(slug);
  if (!cfg || !group) notFound();

  const canonicalUrl = `${SITE_URL}/irctc-train-food-menu/${cfg.slug}`;
  const zoneNames = group.zones.map((z) => z.zone).join(", ");
  const prices = group.zones
    .flatMap((z) => z.services.map((s) => s.price))
    .filter((p): p is number => typeof p === "number");
  const min = prices.length ? Math.min(...prices) : null;
  const max = prices.length ? Math.max(...prices) : null;

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
      { "@type": "ListItem", position: 3, name: cfg.heading, item: canonicalUrl },
    ],
  };
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: `How much does food cost in ${cfg.classGroupName}?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `IRCTC catering charges for ${cfg.classGroupName}${
            min != null && max != null
              ? ` range from ₹${min} to ₹${max} per meal (inclusive of taxes)`
              : " are listed per meal (inclusive of taxes)"
          }. Morning tea, breakfast, lunch/dinner and evening snacks each have a set price, with daily menu sets that rotate through the week and vary by zone (${zoneNames}).`,
        },
      },
      {
        "@type": "Question",
        name: `Which trains use this menu?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `This is the standard IRCTC menu for ${cfg.covers}. The exact dishes depend on the zone your train runs in.`,
        },
      },
    ],
  };

  return (
    <>
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
        <span className="text-slate-700">{cfg.classGroup}</span>
      </nav>

      <header className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
          IRCTC standard catering
        </p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 text-balance sm:text-3xl">
          {cfg.heading}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          Official IRCTC food menu and catering prices for {cfg.classGroupName},
          the standard menu for {cfg.covers}. Pick your zone to see morning tea,
          breakfast, lunch/dinner and evening snack sets with per-meal prices
          {min != null ? `, from ₹${min}` : ""}, inclusive of taxes.
        </p>
      </header>

      <StandardMenuView group={group} />

      <p className="mt-6 text-sm text-slate-500">
        See also{" "}
        <Link
          href="/irctc-train-food-menu/mail-express-humsafar"
          className="font-medium text-blue-700 hover:underline"
        >
          Mail / Express / Humsafar charges
        </Link>{" "}
        or{" "}
        <Link
          href="/irctc-train-food-menu"
          className="font-medium text-blue-700 hover:underline"
        >
          per-train menus (Vande Bharat &amp; Tejas)
        </Link>
        .
      </p>
    </>
  );
}
