import Link from "next/link";
import AdminPasswordGate from "./AdminPasswordGate";
import AdminLockButton from "./AdminLockButton";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminPasswordGate>
      <div className="min-h-screen bg-slate-50">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
            <Link href="/" className="text-xl font-semibold text-primary">LastBerth</Link>
            <nav className="flex flex-wrap items-center gap-4">
              <Link href="/admin/alerts" className="text-sm font-medium text-slate-600 hover:text-slate-900">Alerts</Link>
              <Link href="/admin/chart-time-ingestion" className="text-sm font-medium text-slate-600 hover:text-slate-900">Chart-time ingestion</Link>
              <AdminLockButton />
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </div>
    </AdminPasswordGate>
  );
}
