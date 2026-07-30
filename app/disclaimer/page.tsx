import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Disclaimer | LastBerth',
  description: 'Official disclaimer regarding non-affiliation, data accuracy, and usage guidelines for LastBerth.',
};

export default function DisclaimerPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <nav className="mb-8 flex text-sm text-slate-500">
        <Link href="/" className="hover:text-blue-600 hover:underline">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-slate-900">Disclaimer</span>
      </nav>

      <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
          Disclaimer
        </h1>

        <div className="prose prose-slate max-w-none text-slate-600 space-y-6">
          <p className="text-sm text-slate-500">Last updated: July 30, 2026</p>

          <h2 className="text-xl font-bold text-slate-900 pt-2">1. Non-Affiliation Notice</h2>
          <p>
            <strong>LastBerth</strong> is an independent web portal and educational informational resource. We are <strong>NOT</strong> affiliated, associated, authorized, endorsed by, or in any way officially connected with Indian Railways, Indian Railway Catering and Tourism Corporation (IRCTC), Centre for Railway Information Systems (CRIS), or the Ministry of Railways, Government of India.
          </p>
          <p>
            The official Indian Railways website can be found at <a href="https://indianrail.gov.in" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">indianrail.gov.in</a> and IRCTC at <a href="https://www.irctc.co.in" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">irctc.co.in</a>.
          </p>

          <h2 className="text-xl font-bold text-slate-900 pt-2">2. Accuracy of Information</h2>
          <p>
            All information provided on LastBerth—including train schedules, seat availability insights, chart vacancy tools, refund rules, and catering menus—is compiled for general guidance and informational purposes only. While we make every effort to keep data accurate and updated, railway schedules, quotas, and fare structures are subject to change by official authorities without notice.
          </p>

          <h2 className="text-xl font-bold text-slate-900 pt-2">3. No Commercial Ticket Transactions</h2>
          <p>
            LastBerth does not process ticket bookings, payments, cancellations, or refund requests. Users are advised to double-check reservation details and execute transactions solely on official Indian Railways portals or authorized travel partners.
          </p>

          <h2 className="text-xl font-bold text-slate-900 pt-2">4. Limitation of Liability</h2>
          <p>
            Under no circumstances shall LastBerth or its operators be liable for any direct, indirect, incidental, or consequential loss or damage arising out of reliance on the information, tools, or content provided on this website.
          </p>
        </div>
      </div>
    </div>
  );
}
