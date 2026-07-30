import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Contact Us | LastBerth',
  description: 'Get in touch with the LastBerth team for inquiries, feedback, data corrections, or support.',
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <nav className="mb-8 flex text-sm text-slate-500">
        <Link href="/" className="hover:text-blue-600 hover:underline">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-slate-900">Contact Us</span>
      </nav>

      <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
          Contact Us
        </h1>

        <p className="mb-8 text-lg text-slate-600">
          Have a question, feedback, or suggestion for LastBerth? We’d love to hear from you.
        </p>

        <div className="grid gap-8 md:grid-cols-2">
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-6">
            <h2 className="mb-4 text-xl font-bold text-slate-900">Direct Support</h2>
            <p className="mb-4 text-slate-600 text-sm">
              For general inquiries, feature requests, or reporting an issue on the platform, please reach out via email:
            </p>
            <div className="font-mono text-sm text-blue-600 font-semibold bg-white p-3 rounded border border-slate-200 inline-block">
              support@lastberth.com
            </div>
            <p className="mt-4 text-xs text-slate-500">
              We typically respond within 24 to 48 business hours.
            </p>
          </div>

          <div className="rounded-lg border border-slate-100 bg-slate-50 p-6">
            <h2 className="mb-4 text-xl font-bold text-slate-900">Topics We Help With</h2>
            <ul className="list-disc pl-5 space-y-2 text-sm text-slate-600">
              <li>Site feedback and feature suggestions</li>
              <li>Data inaccuracy reports or corrections</li>
              <li>Partnership and advertising inquiries</li>
              <li>Privacy and technical assistance</li>
            </ul>
          </div>
        </div>

        <div className="mt-8 rounded-lg bg-blue-50 border border-blue-100 p-6">
          <h3 className="text-md font-semibold text-blue-900 mb-2">Notice Regarding Ticket Bookings</h3>
          <p className="text-sm text-blue-800">
            Please note that LastBerth does not sell tickets or process refund requests for Indian Railways. For official ticket booking, refund status, or official customer care, please visit the official IRCTC website at irctc.co.in or call 139.
          </p>
        </div>
      </div>
    </div>
  );
}
