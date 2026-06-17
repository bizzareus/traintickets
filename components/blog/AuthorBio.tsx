import React from "react";

export function AuthorBio() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: "Kartik Arora",
    url: "https://lastberth.com/about",
    jobTitle: "Railway Travel Expert",
    description: "Kartik has completed over 500 train journeys across India and specializes in decoding IRCTC booking algorithms, Tatkal tricks, and PNR confirmation probabilities.",
    knowsAbout: ["Indian Railways", "IRCTC", "Tatkal Booking", "Waitlist Confirmation"]
  };

  return (
    <div className="mt-12 rounded-xl bg-slate-50 p-6 sm:p-8 flex flex-col sm:flex-row items-center sm:items-start gap-6 border border-slate-100">
      <div className="flex-shrink-0">
        <div className="h-20 w-20 sm:h-24 sm:w-24 rounded-full overflow-hidden bg-slate-200 border-4 border-white shadow-md flex items-center justify-center text-slate-400 font-bold text-3xl">
          K
        </div>
      </div>
      <div className="flex-1 text-center sm:text-left">
        <h3 className="text-xl font-bold text-slate-900">Kartik Arora</h3>
        <p className="text-sm font-medium text-blue-600 mb-3">Railway Travel Expert • 500+ Journeys</p>
        <p className="text-sm text-slate-600 leading-relaxed">
          Kartik is a passionate Indian Railways traveler who has spent years decoding the complex algorithms behind IRCTC waitlists, Tatkal quotas, and chart preparation. He built LastBerth to help fellow travelers find confirmed tickets when all hope seems lost.
        </p>
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </div>
  );
}
