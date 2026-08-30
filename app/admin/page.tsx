import Link from "next/link";

export default function AdminPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Admin</h1>
      <p className="mt-1 text-slate-600">Track user alerts and manage chart-time backfills.</p>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link
          href="/admin/analytics"
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow transition hover:shadow-lg hover:-translate-y-0.5"
        >
          <h2 className="font-semibold text-slate-900">Analytics & Short Links</h2>
          <p className="mt-1 text-sm text-slate-600">Track notifications created & delivered, growth trends, and short link clicks tracking.</p>
        </Link>
        <Link
          href="/admin/alerts"
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow transition hover:shadow-lg hover:-translate-y-0.5"
        >
          <h2 className="font-semibold text-slate-900">Alerts</h2>
          <p className="mt-1 text-sm text-slate-600">View all journey monitoring tasks and user alerts.</p>
        </Link>
        <Link
          href="/admin/chart-time-ingestion"
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow transition hover:shadow-lg hover:-translate-y-0.5"
        >
          <h2 className="font-semibold text-slate-900">Chart-time ingestion</h2>
          <p className="mt-1 text-sm text-slate-600">Trigger station-wise chart-time backfill via IRCTC.</p>
        </Link>
        <Link
          href="/admin/irctc-cookies"
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow transition hover:shadow-lg hover:-translate-y-0.5"
        >
          <h2 className="font-semibold text-slate-900">IRCTC cookies</h2>
          <p className="mt-1 text-sm text-slate-600">View the keeper status, refresh, or paste in a cookie manually.</p>
        </Link>
      </ul>
    </div>
  );
}
