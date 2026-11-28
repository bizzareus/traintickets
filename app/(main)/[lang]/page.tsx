import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HomeClient } from "@/components/home/HomeClient";
import {
  HOME_LANGS,
  getHomeStrings,
  homeHreflang,
  isHomeLang,
} from "@/lib/home/home-i18n";
import {
  buildOpenGraph,
  buildTwitterCard,
  truncateMetaDescription,
  truncateTitle,
} from "@/lib/seo/metadata";

type Props = { params: Promise<{ lang: string }> };

export function generateStaticParams() {
  return HOME_LANGS.filter((l) => l !== "en").map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  if (!isHomeLang(lang) || lang === "en") return {};
  const t = getHomeStrings(lang);
  const title = truncateTitle(`${t.hero.titleHighlight} & ${t.nav.pnrStatus}`);
  const fullTitle = `${title} | LastBerth`;
  const description = truncateMetaDescription(
    `${t.hero.subtitle}. ${t.seo.subtitle}`,
  );
  return {
    title,
    description,
    alternates: {
      canonical: `/${lang}`,
      languages: homeHreflang(),
    },
    openGraph: buildOpenGraph({
      title: fullTitle,
      description,
      url: `/${lang}`,
      lang,
    }),
    twitter: buildTwitterCard({
      title: fullTitle,
      description,
    }),
  };
}

export default async function LocalizedHomePage({ params }: Props) {
  const { lang } = await params;
  // English lives at "/"; only the regional locales render here.
  if (!isHomeLang(lang) || lang === "en") notFound();
  return <HomeClient lang={lang} t={getHomeStrings(lang)} />;
}
