import Link from "next/link";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/" className="text-xl font-semibold text-primary">LastBerth</Link>
          <nav className="flex gap-4">
            <Link href="/admin/trains" className="text-sm font-medium text-slate-600 hover:text-slate-900">Trains</Link>
            <Link href="/admin/chart-rules" className="text-sm font-medium text-slate-600 hover:text-slate-900">Chart rules</Link>
            <Link href="/admin/instances" className="text-sm font-medium text-slate-600 hover:text-slate-900">Chart instances</Link>
            <Link href="/admin/executions" className="text-sm font-medium text-slate-600 hover:text-slate-900">Executions</Link>
            <Link href="/dashboard" className="text-sm font-medium text-slate-600 hover:text-slate-900">Dashboard</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
