import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'About Us | LastBerth',
  description: 'Learn about LastBerth, our mission to help Indian Railways travelers find chart vacancy and seat availability insights.',
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <nav className="mb-8 flex text-sm text-slate-500">
        <Link href="/" className="hover:text-blue-600 hover:underline">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-slate-900">About Us</span>
      </nav>

      <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
          About LastBerth
        </h1>

        <div className="prose prose-slate max-w-none text-slate-600 space-y-6">
          <p className="text-lg leading-relaxed text-slate-700">
            Welcome to <strong>LastBerth</strong>, your trusted companion for Indian Railways travel, reservation insights, chart vacancy tracking, and seat availability guide.
          </p>

          <h2 className="text-2xl font-bold text-slate-900 pt-4">Our Mission</h2>
          <p>
            Every day, millions of passengers across India travel by train. Securing a confirmed ticket or finding last-minute vacant berths after chart preparation can be stressful and complex. LastBerth was built to bring clarity, speed, and helpful data to every railway journey.
          </p>

          <h2 className="text-2xl font-bold text-slate-900 pt-4">What We Provide</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong>Chart Vacancy Tools:</strong> Quickly discover available berths after reservation charts are finalized.</li>
            <li><strong>PNR & Travel Guides:</strong> Clear, actionable advice on PNR status predictions, waitlist rules, Tatkal tips, and refund policies.</li>
            <li><strong>Train Menu & Food Guides:</strong> Comprehensive information on official IRCTC train catering menus and dining options.</li>
            <li><strong>Railway Glossary:</strong> Simple explanations of complex railway terms like PQWL, GNWL, RLWL, EQ quota, and chart preparation timings.</li>
          </ul>

          <h2 className="text-2xl font-bold text-slate-900 pt-4">Data Quality & Transparency</h2>
          <p>
            We strive to provide accurate, up-to-date travel information and intuitive tools. All guides and data aggregations are compiled with care to assist train passengers in making informed decisions.
          </p>

          <h2 className="text-2xl font-bold text-slate-900 pt-4">Independent Platform</h2>
          <p>
            LastBerth is an independent informational platform. We are not affiliated with, endorsed by, or connected to Indian Railways, IRCTC, or CRIS. For official ticket booking, cancellations, and official charts, please visit official portals such as irctc.co.in or indianrail.gov.in.
          </p>
        </div>
      </div>
    </div>
  );
}
