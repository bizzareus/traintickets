import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BlogIndexContent } from "@/components/blog/BlogIndexContent";

type BlogIndexPageProps = {
  searchParams?: Promise<{ lang?: string }>;
};

export async function generateMetadata(): Promise<Metadata> {
  const allLangs = ["en", "mr", "hi", "bn", "ta", "te", "ml"];
  const languages: Record<string, string> = {};
  for (const l of allLangs) {
    const url = l === "en" ? "/blog" : `/blog/${l}`;
    languages[l] = url;
    languages[`${l}-IN`] = url;
  }
  languages["x-default"] = "/blog";

  return {
    title: "Read & Find Confirmed Train Tickets | Train Travel Guides",
    alternates: {
      canonical: "/blog",
      languages,
    },
  };
}

export default async function BlogIndexPage({
  searchParams,
}: BlogIndexPageProps) {
  const { lang = "en" } = (await searchParams) || {};

  if (lang !== "en") {
    redirect(`/blog/${lang}`);
  }

  const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://lastberth.com";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    "@id": `${siteUrl}/blog#blog`,
    name: "LastBerth Train Travel & Ticket Booking Guides",
    description:
      "Read practical guides, tips, and insights on finding confirmed train tickets, understanding railway charting preparation, and planning smarter journeys with LastBerth.",
    url: `${siteUrl}/blog`,
    publisher: {
      "@id": `${siteUrl}/#organization`,
    },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${siteUrl}/` },
        {
          "@type": "ListItem",
          position: 2,
          name: "Blog",
          item: `${siteUrl}/blog`,
        },
      ],
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <BlogIndexContent lang="en" />
    </>
  );
}
