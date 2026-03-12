import Link from "next/link";

export default function AdminPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Admin</h1>
      <p className="mt-1 text-slate-600">Manage trains, chart rules, and view execution logs.</p>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link
          href="/admin/trains"
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow transition hover:shadow-lg hover:-translate-y-0.5"
        >
          <h2 className="font-semibold text-slate-900">Trains</h2>
          <p className="mt-1 text-sm text-slate-600">View and add trains.</p>
        </Link>
        <Link
          href="/admin/chart-rules"
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow transition hover:shadow-lg hover:-translate-y-0.5"
        >
          <h2 className="font-semibold text-slate-900">Chart rules</h2>
          <p className="mt-1 text-sm text-slate-600">Manage chart preparation times per train/station.</p>
        </Link>
        <Link
          href="/admin/instances"
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow transition hover:shadow-lg hover:-translate-y-0.5"
        >
          <h2 className="font-semibold text-slate-900">Chart event instances</h2>
          <p className="mt-1 text-sm text-slate-600">Generated instances for journey dates.</p>
        </Link>
        <Link
          href="/admin/executions"
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow transition hover:shadow-lg hover:-translate-y-0.5"
        >
          <h2 className="font-semibold text-slate-900">Executions</h2>
          <p className="mt-1 text-sm text-slate-600">Browser execution logs.</p>
        </Link>
      </ul>
    </div>
  );
}
