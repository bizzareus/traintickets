import React from "react";

export function AuthorBio() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: "Kartik Arora",
    url: "https://lastberth.com/about",
    jobTitle: "Railway Travel Expert",
    description:
      "Kartik has completed over 500 train journeys across India and specializes in decoding IRCTC booking algorithms, Tatkal tricks, and PNR confirmation probabilities.",
    knowsAbout: [
      "Indian Railways",
      "IRCTC",
      "Tatkal Booking",
      "Waitlist Confirmation",
    ],
  };

  return (
    <div className="mt-12 flex flex-col items-center gap-6 rounded-xl border border-slate-100 bg-slate-50 p-6 sm:flex-row sm:items-start sm:p-8">
      <div className="flex-shrink-0">
        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-slate-200 text-3xl font-bold text-slate-400 shadow-md sm:h-24 sm:w-24">
          K
        </div>
      </div>
      <div className="flex-1 text-center sm:text-left">
        <h3 className="text-xl font-bold text-slate-900">Kartik Arora</h3>
        <p className="mb-3 text-sm font-medium text-blue-600">
          Railway Travel Expert • 500+ Journeys
        </p>
        <p className="text-sm leading-relaxed text-slate-600">
          Kartik is a passionate Indian Railways traveler who has spent years
          decoding the complex algorithms behind IRCTC waitlists, Tatkal quotas,
          and chart preparation. He built LastBerth to help fellow travelers
          find confirmed tickets when all hope seems lost.
        </p>
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </div>
  );
}
