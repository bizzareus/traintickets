import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getAllGlossaryTerms, getGlossaryTerm } from "@/lib/seo/glossary-db";

export const dynamicParams = false;

export async function generateStaticParams() {
  return getAllGlossaryTerms().map((t) => ({
    term: t.id,
  }));
}

type Props = {
  params: Promise<{ term: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { term } = await params;
  const item = getGlossaryTerm(term);
  if (!item) return {};

  return {
    title: `What is ${item.term}? | Indian Railway Glossary`,
    description: `Meaning and definition of ${item.term} in Indian Railway bookings. ${item.definition.slice(0, 100)}...`,
    alternates: {
      canonical: `/glossary/${item.id}`,
    },
  };
}

export default async function GlossaryTermPage({ params }: Props) {
  const { term } = await params;
  const item = getGlossaryTerm(term);
  if (!item) notFound();

  const related = (item.relatedTerms || [])
    .map((id) => getGlossaryTerm(id))
    .filter(Boolean) as typeof item[];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "DefinedTerm",
    name: item.term,
    description: item.definition,
    inDefinedTermSet: "https://lastberth.com/glossary"
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <nav className="mb-8 flex text-sm text-slate-500">
        <Link href="/glossary" className="hover:text-blue-600 hover:underline">
          Glossary
        </Link>
        <span className="mx-2">/</span>
        <span className="text-slate-900">{item.term}</span>
      </nav>

      <article className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
          {item.term}
        </h1>
        
        <div className="mt-8 prose prose-slate prose-lg max-w-none">
          <p className="lead text-xl text-slate-700 font-medium">
            {item.definition}
          </p>
          <p>
            Understanding terms like {item.term} is crucial when booking train tickets on the IRCTC platform. For a complete guide on how this affects your booking, browse our full collection of railway guides.
          </p>
        </div>

        {related.length > 0 && (
          <div className="mt-12 border-t border-slate-100 pt-8">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Related Terms</h2>
            <div className="flex flex-wrap gap-3">
              {related.map((r) => (
                <Link
                  key={r.id}
                  href={`/glossary/${r.id}`}
                  className="rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
                >
                  {r.term}
                </Link>
              ))}
            </div>
          </div>
        )}
      </article>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </div>
  );
}
