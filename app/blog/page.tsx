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
    title: "Read & Find Confirmed Train Tickets | IRCTC Booking Guides",
    alternates: {
      canonical: "/blog",
      languages,
    },
  };
}

export default async function BlogIndexPage({ searchParams }: BlogIndexPageProps) {
  const { lang = "en" } = (await searchParams) || {};
  
  if (lang !== "en") {
    redirect(`/blog/${lang}`);
  }

  return <BlogIndexContent lang="en" />;
}
