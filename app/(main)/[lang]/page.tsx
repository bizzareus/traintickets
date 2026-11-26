import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HomeClient } from "@/components/home/HomeClient";
import {
  HOME_LANGS,
  getHomeStrings,
  homeHreflang,
  isHomeLang,
} from "@/lib/home/home-i18n";
import { buildOpenGraph } from "@/lib/seo/metadata";

type Props = { params: Promise<{ lang: string }> };

export function generateStaticParams() {
  return HOME_LANGS.filter((l) => l !== "en").map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  if (!isHomeLang(lang) || lang === "en") return {};
  const t = getHomeStrings(lang);
  const title = "LastBerth – Find Confirmed Train Tickets & Smart Seat Finder";
  const description = t.hero.subtitle;
  return {
    alternates: {
      canonical: `/${lang}`,
      languages: homeHreflang(),
    },
    openGraph: buildOpenGraph({
      title,
      description,
      url: `/${lang}`,
    }),
  };
}

export default async function LocalizedHomePage({ params }: Props) {
  const { lang } = await params;
  // English lives at "/"; only the regional locales render here.
  if (!isHomeLang(lang) || lang === "en") notFound();
  return <HomeClient lang={lang} t={getHomeStrings(lang)} />;
}
